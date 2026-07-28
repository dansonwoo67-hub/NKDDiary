alter table public.calendar_events
  add column if not exists event_type text not null default 'date'
  check (event_type in ('date', 'anniversary', 'birthday', 'travel', 'todo', 'other')),
  add column if not exists is_important boolean not null default false,
  add column if not exists end_date date,
  add column if not exists description text not null default '';

create table if not exists public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 5000),
  occurred_on date not null,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_entries_space_occurred_idx
on public.memory_entries(space_id, occurred_on desc, created_at desc);

alter table public.memory_entries enable row level security;

drop policy if exists "active members can read space memories" on public.memory_entries;
create policy "active members can read space memories"
on public.memory_entries for select to authenticated
using (public.is_active_space_member(space_id));

revoke all privileges on table public.memory_entries from anon, authenticated;
grant select on table public.memory_entries to authenticated;

create or replace function public.create_memory_entry(
  p_id uuid,
  p_space_id uuid,
  p_title text,
  p_body text,
  p_occurred_on date,
  p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_expected_path text;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'memory space access denied' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 80
     or char_length(v_body) > 5000
     or p_occurred_on is null then
    raise exception 'invalid memory entry' using errcode = '22023';
  end if;
  v_expected_path := p_space_id::text || '/' || v_actor::text || '/' || p_id::text || '.webp';
  if p_image_path is not null and p_image_path is distinct from v_expected_path then
    raise exception 'invalid memory image path' using errcode = '22023';
  end if;

  insert into public.memory_entries(
    id, space_id, author_id, title, body, occurred_on, image_path
  ) values (
    p_id, p_space_id, v_actor, v_title, v_body, p_occurred_on, p_image_path
  );
  return p_id;
end;
$$;

create or replace function public.update_memory_entry(
  p_id uuid,
  p_title text,
  p_body text,
  p_occurred_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
     or char_length(coalesce(p_body, '')) > 5000
     or p_occurred_on is null then
    raise exception 'invalid memory entry' using errcode = '22023';
  end if;

  update public.memory_entries as memory
  set title = btrim(p_title),
      body = btrim(coalesce(p_body, '')),
      occurred_on = p_occurred_on,
      updated_at = now()
  where memory.id = p_id
    and memory.author_id = v_actor
    and memory.created_at > now() - interval '24 hours'
    and public.is_active_space_member(memory.space_id, v_actor);

  if not found then
    raise exception 'memory edit window closed' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_memory_entry(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_image_path text;
begin
  delete from public.memory_entries as memory
  where memory.id = p_id
    and memory.author_id = v_actor
    and memory.created_at > now() - interval '24 hours'
    and public.is_active_space_member(memory.space_id, v_actor)
  returning memory.image_path into v_image_path;

  if not found then
    raise exception 'memory delete window closed' using errcode = '42501';
  end if;
  return v_image_path;
end;
$$;

revoke execute on function public.create_memory_entry(uuid, uuid, text, text, date, text) from public, anon;
revoke execute on function public.update_memory_entry(uuid, text, text, date) from public, anon;
revoke execute on function public.delete_memory_entry(uuid) from public, anon;
grant execute on function public.create_memory_entry(uuid, uuid, text, text, date, text) to authenticated;
grant execute on function public.update_memory_entry(uuid, text, text, date) to authenticated;
grant execute on function public.delete_memory_entry(uuid) to authenticated;

create or replace function public.create_space_calendar_event_v2(
  p_space_id uuid,
  p_name text,
  p_event_date date,
  p_end_date date,
  p_event_type text,
  p_recurrence public.recurrence_type,
  p_is_important boolean,
  p_description text,
  p_icon text,
  p_color text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'calendar space access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40
     or p_event_type not in ('date', 'anniversary', 'birthday', 'travel', 'todo', 'other')
     or p_recurrence not in ('none', 'monthly', 'yearly')
     or p_color not in ('rose', 'gold', 'blue', 'green', 'purple')
     or char_length(coalesce(p_description, '')) > 1000
     or (p_end_date is not null and p_end_date < p_event_date) then
    raise exception 'invalid calendar event' using errcode = '22023';
  end if;

  insert into public.calendar_events(
    space_id, creator_id, name, event_date, end_date, event_type,
    recurrence, is_important, description, icon, color
  ) values (
    p_space_id, v_actor, btrim(p_name), p_event_date, p_end_date, p_event_type,
    p_recurrence, coalesce(p_is_important, false), btrim(coalesce(p_description, '')),
    p_icon, p_color
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_space_calendar_event_v2(
  uuid, text, date, date, text, public.recurrence_type, boolean, text, text, text
) from public, anon;
grant execute on function public.create_space_calendar_event_v2(
  uuid, text, date, date, text, public.recurrence_type, boolean, text, text, text
) to authenticated;

create or replace function public.update_couple_preferences(
  p_display_name text,
  p_avatar_url text,
  p_relationship_started_on date,
  p_display_preferences jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space uuid;
  v_theme text := coalesce(p_display_preferences->>'theme', 'system');
begin
  v_space := public.resolve_single_active_space(v_actor);
  if v_actor is null or v_space is null then
    raise exception 'profile access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 24
     or p_relationship_started_on > (now() at time zone 'Asia/Shanghai')::date
     or jsonb_typeof(coalesce(p_display_preferences, '{}'::jsonb)) <> 'object'
     or coalesce(p_display_preferences, '{}'::jsonb) - 'compactCalendar' - 'theme' <> '{}'::jsonb
     or v_theme not in ('light', 'dark', 'system') then
    raise exception 'invalid profile preferences' using errcode = '22023';
  end if;

  update public.profiles
  set display_name = btrim(p_display_name),
      avatar_url = coalesce(p_avatar_url, avatar_url),
      display_preferences = jsonb_build_object(
        'compactCalendar', coalesce((p_display_preferences->>'compactCalendar')::boolean, false),
        'theme', v_theme
      )
  where id = v_actor;

  update public.profiles as profile
  set relationship_started_on = p_relationship_started_on
  where exists (
    select 1 from public.space_members as member
    where member.space_id = v_space
      and member.user_id = profile.id
      and member.active
  );
end;
$$;

create or replace function public.update_space_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space uuid := public.resolve_single_active_space(v_actor);
begin
  if v_actor is null
     or v_space is null
     or char_length(btrim(coalesce(p_name, ''))) not between 1 and 40
     or not public.is_active_space_member(v_space, v_actor) then
    raise exception 'invalid space name update' using errcode = '42501';
  end if;
  update public.spaces set name = btrim(p_name) where id = v_space;
end;
$$;

revoke execute on function public.update_space_name(text) from public, anon;
grant execute on function public.update_space_name(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-images', 'memory-images', false, 819200, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authors can upload memory images" on storage.objects;
create policy "authors can upload memory images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'memory-images'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1 from public.space_members as member
    where member.space_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.active
  )
);

drop policy if exists "members can read memory images" on storage.objects;
create policy "members can read memory images"
on storage.objects for select to authenticated
using (
  bucket_id = 'memory-images'
  and exists (
    select 1 from public.space_members as member
    where member.space_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.active
  )
);

drop policy if exists "authors can update memory images" on storage.objects;
create policy "authors can update memory images"
on storage.objects for update to authenticated
using (
  bucket_id = 'memory-images'
  and owner_id = (select auth.uid())::text
  and exists (
    select 1 from public.memory_entries as memory
    where memory.image_path = storage.objects.name
      and memory.author_id = (select auth.uid())
      and memory.created_at > now() - interval '24 hours'
      and public.is_active_space_member(memory.space_id)
  )
)
with check (
  bucket_id = 'memory-images'
  and owner_id = (select auth.uid())::text
);

drop policy if exists "authors can remove memory images" on storage.objects;
create policy "authors can remove memory images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'memory-images'
  and owner_id = (select auth.uid())::text
  and exists (
    select 1 from public.space_members as member
    where member.space_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.active
  )
);
