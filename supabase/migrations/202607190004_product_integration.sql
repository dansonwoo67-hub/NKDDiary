alter table public.profiles
  add column if not exists display_preferences jsonb not null default '{"compactCalendar":false}'::jsonb;

alter table public.calendar_events add column space_id uuid references public.spaces(id) on delete restrict;

update public.calendar_events as event
set space_id = public.resolve_single_active_space(event.creator_id)
where event.space_id is null;

alter table public.calendar_events alter column space_id set not null;

create table public.mood_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null default '' check (char_length(body) <= 140),
  emoji text not null default '' check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or char_length(btrim(emoji)) > 0)
);

create index mood_entries_space_created_idx on public.mood_entries(space_id, created_at desc);
create index calendar_events_space_date_idx on public.calendar_events(space_id, event_date);

create or replace function public.preserve_mood_entry_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if (new.id, new.space_id, new.author_id, new.created_at)
     is distinct from (old.id, old.space_id, old.author_id, old.created_at) then
    raise exception 'mood entry identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger mood_entries_preserve_identity before update on public.mood_entries
for each row execute function public.preserve_mood_entry_identity();

create or replace function public.preserve_calendar_event_identity()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if (new.id, new.space_id, new.creator_id, new.created_at)
     is distinct from (old.id, old.space_id, old.creator_id, old.created_at) then
    raise exception 'calendar event identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger calendar_events_preserve_identity before update on public.calendar_events
for each row execute function public.preserve_calendar_event_identity();

alter table public.mood_entries enable row level security;

drop policy if exists "couple members can read calendar events" on public.calendar_events;
drop policy if exists "couple members can create calendar events" on public.calendar_events;
drop policy if exists "event creator can update calendar events" on public.calendar_events;

create policy "active members can read space moods" on public.mood_entries
for select to authenticated using (public.is_active_space_member(space_id));

create policy "active members can read space calendar events" on public.calendar_events
for select to authenticated using (public.is_active_space_member(space_id));

create or replace function public.create_mood_entry(p_space_id uuid, p_body text, p_emoji text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'mood space access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) > 140
     or char_length(coalesce(p_emoji, '')) > 16
     or (btrim(coalesce(p_body, '')) = '' and btrim(coalesce(p_emoji, '')) = '') then
    raise exception 'invalid mood entry' using errcode = '22023';
  end if;
  insert into public.mood_entries(space_id, author_id, body, emoji)
  values (p_space_id, v_actor, btrim(coalesce(p_body, '')), btrim(coalesce(p_emoji, '')))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_space_calendar_event(
  p_space_id uuid, p_name text, p_event_date date, p_recurrence public.recurrence_type,
  p_icon text, p_color text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'calendar space access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40
     or p_recurrence not in ('none', 'monthly', 'yearly')
     or p_color not in ('rose', 'gold', 'blue', 'green', 'purple') then
    raise exception 'invalid calendar event' using errcode = '22023';
  end if;
  insert into public.calendar_events(space_id, creator_id, name, event_date, recurrence, icon, color)
  values (p_space_id, v_actor, btrim(p_name), p_event_date, p_recurrence, p_icon, p_color)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_couple_preferences(
  p_display_name text, p_avatar_url text, p_relationship_started_on date, p_display_preferences jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_space uuid;
begin
  v_space := public.resolve_single_active_space(v_actor);
  if v_actor is null or v_space is null then
    raise exception 'profile access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 24
     or p_relationship_started_on > (now() at time zone 'Asia/Shanghai')::date
     or jsonb_typeof(coalesce(p_display_preferences, '{}'::jsonb)) <> 'object'
     or coalesce(p_display_preferences, '{}'::jsonb) - 'compactCalendar' <> '{}'::jsonb then
    raise exception 'invalid profile preferences' using errcode = '22023';
  end if;
  update public.profiles set
    display_name = btrim(p_display_name),
    avatar_url = coalesce(p_avatar_url, avatar_url),
    display_preferences = jsonb_build_object('compactCalendar', coalesce((p_display_preferences->>'compactCalendar')::boolean, false))
  where id = v_actor;
  update public.profiles as profile set relationship_started_on = p_relationship_started_on
  where exists (
    select 1 from public.space_members as member
    where member.space_id = v_space and member.user_id = profile.id and member.active
  );
end;
$$;

revoke all privileges on table public.mood_entries from anon, authenticated;
grant select on public.mood_entries to authenticated;
revoke insert, update, delete on public.calendar_events from authenticated;

revoke execute on function public.preserve_mood_entry_identity() from public, anon, authenticated;
revoke execute on function public.preserve_calendar_event_identity() from public, anon, authenticated;
revoke execute on function public.create_mood_entry(uuid, text, text) from public, anon;
revoke execute on function public.create_space_calendar_event(uuid, text, date, public.recurrence_type, text, text) from public, anon;
revoke execute on function public.update_couple_preferences(text, text, date, jsonb) from public, anon;
grant execute on function public.create_mood_entry(uuid, text, text) to authenticated;
grant execute on function public.create_space_calendar_event(uuid, text, date, public.recurrence_type, text, text) to authenticated;
grant execute on function public.update_couple_preferences(text, text, date, jsonb) to authenticated;
