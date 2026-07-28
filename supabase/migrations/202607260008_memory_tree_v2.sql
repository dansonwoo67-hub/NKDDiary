-- Memory tree V2: preserve author identity as it looked when the memory was published.

alter table public.memory_entries
  add column if not exists author_name_snapshot text,
  add column if not exists author_avatar_snapshot text;

update public.memory_entries as memory
set author_name_snapshot = coalesce(memory.author_name_snapshot, profile.display_name),
    author_avatar_snapshot = coalesce(memory.author_avatar_snapshot, profile.avatar_url)
from public.profiles as profile
where profile.id = memory.author_id
  and (memory.author_name_snapshot is null or memory.author_avatar_snapshot is null);

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
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_name text;
  v_avatar text;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'memory space access denied' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 30
     or char_length(v_body) not between 1 and 150
     or p_occurred_on is null then
    raise exception 'invalid memory entry' using errcode = '22023';
  end if;

  v_day_start := ((now() at time zone 'Asia/Shanghai')::date::timestamp at time zone 'Asia/Shanghai');
  v_day_end := v_day_start + interval '1 day';
  if (select count(*) from public.memory_entries
      where author_id = v_actor and created_at >= v_day_start and created_at < v_day_end) >= 3 then
    raise exception 'daily memory limit reached' using errcode = 'P0001';
  end if;

  v_expected_path := p_space_id::text || '/' || v_actor::text || '/' || p_id::text || '.webp';
  if p_image_path is not null and p_image_path is distinct from v_expected_path then
    raise exception 'invalid memory image path' using errcode = '22023';
  end if;

  select display_name, avatar_url into v_name, v_avatar
  from public.profiles where id = v_actor;

  insert into public.memory_entries(
    id, space_id, author_id, title, body, occurred_on, image_path,
    author_name_snapshot, author_avatar_snapshot
  ) values (
    p_id, p_space_id, v_actor, v_title, v_body, p_occurred_on, p_image_path,
    v_name, v_avatar
  );
  return p_id;
end;
$$;

alter table public.mood_entries
  add column if not exists author_name_snapshot text,
  add column if not exists author_avatar_snapshot text;

alter table public.calendar_events
  add column if not exists creator_name_snapshot text,
  add column if not exists creator_avatar_snapshot text;

update public.mood_entries as mood
set author_name_snapshot = coalesce(mood.author_name_snapshot, profile.display_name),
    author_avatar_snapshot = coalesce(mood.author_avatar_snapshot, profile.avatar_url)
from public.profiles as profile
where profile.id = mood.author_id
  and (mood.author_name_snapshot is null or mood.author_avatar_snapshot is null);

update public.calendar_events as event
set creator_name_snapshot = coalesce(event.creator_name_snapshot, profile.display_name),
    creator_avatar_snapshot = coalesce(event.creator_avatar_snapshot, profile.avatar_url)
from public.profiles as profile
where profile.id = event.creator_id
  and (event.creator_name_snapshot is null or event.creator_avatar_snapshot is null);

create or replace function public.capture_mood_author_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select display_name, avatar_url into new.author_name_snapshot, new.author_avatar_snapshot
  from public.profiles where id = new.author_id;
  return new;
end;
$$;

drop trigger if exists capture_mood_author_snapshot on public.mood_entries;
create trigger capture_mood_author_snapshot
before insert on public.mood_entries
for each row execute function public.capture_mood_author_snapshot();

create or replace function public.capture_event_creator_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select display_name, avatar_url into new.creator_name_snapshot, new.creator_avatar_snapshot
  from public.profiles where id = new.creator_id;
  return new;
end;
$$;

drop trigger if exists capture_event_creator_snapshot on public.calendar_events;
create trigger capture_event_creator_snapshot
before insert on public.calendar_events
for each row execute function public.capture_event_creator_snapshot();
