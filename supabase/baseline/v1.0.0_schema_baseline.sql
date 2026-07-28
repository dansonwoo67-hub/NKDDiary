-- NKDDiary v1.0.0 offline schema baseline candidate
-- Application commit: dd161e2414f93d686780a314e45f998d445aa9bd
-- Generated: 2026-07-28 (Asia/Shanghai)
--
-- SAFETY:
--   * EMPTY ENVIRONMENTS ONLY.
--   * DO NOT APPLY TO THE EXISTING PRODUCTION DATABASE.
--   * This file was derived offline from the 42 committed pre-v1.0 migrations.
--   * It has not been executed or compared against a disposable database.
--   * Production business data, auth users, Storage objects, and notification
--     rows are intentionally absent.
--   * Retired letter deletion/recycle-bin objects are intentionally absent.
--
-- Static configuration retained:
--   * pgcrypto extension
--   * application enums, tables, constraints, indexes, RPCs, triggers, RLS,
--     grants/revokes, Storage buckets, and Storage policies
--
-- Scheduled jobs:
--   Historical local SQL contains no active pg_cron schedule. The capsule API
--   route is application-owned. Any future database cron definition requires
--   separate environment review and must not be inferred here.

-- Baseline correction: the superseded policy body from
-- 202607270005_fix_letter_classification.sql is omitted because corrupted
-- inline comments comment out required boolean expressions. The final release
-- policy is defined by 202607280009_finalize_letter_notification_state.sql.


-- ============================================================================
-- Source history: 202607100001_initial_schema.sql
-- ============================================================================

create extension if not exists pgcrypto;

create type public.recurrence_type as enum ('none', 'monthly', 'yearly');

create type public.notification_type as enum ('annotation', 'annotation_reply', 'calendar_event', 'letter_opened');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  login_name text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar_url text,
  last_login_at timestamptz,
  last_login_latitude double precision,
  last_login_longitude double precision,
  relationship_started_on date not null default date '2024-01-01',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  letter_date date not null,
  body text not null check (char_length(body) between 1 and 20000),
  self_mood_value smallint not null check (self_mood_value between 1 and 5),
  meal_value smallint not null check (meal_value between 1 and 5),
  health_value smallint not null check (health_value between 1 and 5),
  seven_char_line text not null check (char_length(seven_char_line) between 1 and 7),
  latitude double precision,
  longitude double precision,
  location_recorded_at timestamptz,
  submitted_at timestamptz not null default now(),
  editable_until timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, letter_date)
);

create table public.letter_open_responses (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete restrict,
  reader_id uuid not null references public.profiles(id) on delete restrict,
  response_text text not null check (char_length(response_text) between 1 and 3),
  created_at timestamptz not null default now(),
  unique (letter_id, reader_id)
);

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  quoted_text text not null check (char_length(quoted_text) between 1 and 1000),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  comment text not null check (char_length(comment) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.annotation_replies (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references public.annotations(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 40),
  event_date date not null,
  recurrence public.recurrence_type not null default 'none',
  icon text not null check (char_length(icon) between 1 and 4),
  color text not null check (color in ('rose', 'gold', 'blue', 'green', 'purple')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  type public.notification_type not null,
  source_id uuid not null,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 240),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.lock_letter_window()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at = now();
    new.editable_until = new.submitted_at + interval '24 hours';
  elsif tg_op = 'UPDATE' then
    new.author_id = old.author_id;
    new.letter_date = old.letter_date;
    new.submitted_at = old.submitted_at;
    new.editable_until = old.editable_until;
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger letters_set_updated_at before update on public.letters
for each row execute function public.set_updated_at();

create trigger letters_lock_window before insert or update on public.letters
for each row execute function public.lock_letter_window();

create trigger annotations_set_updated_at before update on public.annotations
for each row execute function public.set_updated_at();

create trigger annotation_replies_set_updated_at before update on public.annotation_replies
for each row execute function public.set_updated_at();

create trigger calendar_events_set_updated_at before update on public.calendar_events
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

alter table public.letters enable row level security;

alter table public.letter_open_responses enable row level security;

alter table public.annotations enable row level security;

alter table public.annotation_replies enable row level security;

alter table public.calendar_events enable row level security;

alter table public.notifications enable row level security;

create policy "couple members can read profiles"
on public.profiles for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can update own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read letters"
on public.letters for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can insert own letter"
on public.letters for insert to authenticated
with check (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can edit own letter within 24 hours"
on public.letters for update to authenticated
using (author_id = (select auth.uid()) and now() <= editable_until and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (author_id = (select auth.uid()) and now() <= editable_until and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read open responses"
on public.letter_open_responses for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create own open response"
on public.letter_open_responses for insert to authenticated
with check (reader_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read annotations"
on public.annotations for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create own annotations"
on public.annotations for insert to authenticated
with check (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can update own annotations"
on public.annotations for update to authenticated
using (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read annotation replies"
on public.annotation_replies for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create own annotation replies"
on public.annotation_replies for insert to authenticated
with check (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read calendar events"
on public.calendar_events for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create calendar events"
on public.calendar_events for insert to authenticated
with check (creator_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "event creator can update calendar events"
on public.calendar_events for update to authenticated
using (creator_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (creator_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can read own notifications"
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create notifications"
on public.notifications for insert to authenticated
with check (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can update own notifications"
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (recipient_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

grant usage on schema public to authenticated;

grant select on public.profiles, public.letters, public.letter_open_responses, public.annotations, public.annotation_replies, public.calendar_events, public.notifications to authenticated;

grant update (display_name, avatar_url, last_login_at, last_login_latitude, last_login_longitude, updated_at) on public.profiles to authenticated;

grant insert on public.letters, public.letter_open_responses, public.annotations, public.annotation_replies, public.calendar_events to authenticated;

grant update (body, self_mood_value, meal_value, health_value, seven_char_line, latitude, longitude, location_recorded_at, updated_at) on public.letters to authenticated;

grant update (quoted_text, start_offset, end_offset, comment, updated_at) on public.annotations to authenticated;

grant update (name, event_date, recurrence, icon, color, updated_at) on public.calendar_events to authenticated;

grant insert on public.notifications to authenticated;

grant update (is_read) on public.notifications to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "couple members can read avatars"
on storage.objects for select to authenticated
using (bucket_id = 'avatars' and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can upload own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and owner = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can update own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (bucket_id = 'avatars' and owner = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

revoke execute on function public.set_updated_at() from public;

revoke execute on function public.lock_letter_window() from public;


-- ============================================================================
-- Source history: 202607100002_harden_security_and_indexes.sql
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.lock_letter_window()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at = now();
    new.editable_until = new.submitted_at + interval '24 hours';
  elsif tg_op = 'UPDATE' then
    new.author_id = old.author_id;
    new.letter_date = old.letter_date;
    new.submitted_at = old.submitted_at;
    new.editable_until = old.editable_until;
  end if;
  return new;
end;
$$;

create index if not exists letters_author_id_idx on public.letters(author_id);

create index if not exists letter_open_responses_letter_id_idx on public.letter_open_responses(letter_id);

create index if not exists letter_open_responses_reader_id_idx on public.letter_open_responses(reader_id);

create index if not exists annotations_letter_id_idx on public.annotations(letter_id);

create index if not exists annotations_author_id_idx on public.annotations(author_id);

create index if not exists annotation_replies_annotation_id_idx on public.annotation_replies(annotation_id);

create index if not exists annotation_replies_author_id_idx on public.annotation_replies(author_id);

create index if not exists calendar_events_creator_id_idx on public.calendar_events(creator_id);

create index if not exists notifications_recipient_id_idx on public.notifications(recipient_id);


-- ============================================================================
-- Source history: 202607190001_rebuild_core.sql
-- ============================================================================

create type public.journal_entry_type as enum ('today', 'future');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  timezone text not null default 'Asia/Shanghai' check (timezone = 'Asia/Shanghai'),
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  active boolean not null default true,
  primary key (space_id, user_id)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  recipient_id uuid references auth.users(id) on delete restrict,
  entry_type public.journal_entry_type not null,
  title text not null check (char_length(title) between 1 and 80),
  content text not null check (char_length(content) between 1 and 20000),
  image_path text,
  entry_date date,
  created_local_date date not null,
  published_at timestamptz not null default now(),
  locked_at timestamptz,
  sealed_at timestamptz,
  open_at timestamptz,
  opened_at timestamptz,
  opened_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      entry_type = 'today'
      and recipient_id is null
      and entry_date is not null
      and locked_at is not null
      and sealed_at is null
      and open_at is null
      and opened_at is null
      and opened_by is null
    )
    or
    (
      entry_type = 'future'
      and recipient_id is not null
      and recipient_id <> author_id
      and entry_date is null
      and locked_at is not null
      and sealed_at is not null
      and open_at is not null
      and (opened_at is null) = (opened_by is null)
    )
  )
);

create unique index one_today_diary_per_author_date
  on public.journal_entries(space_id, author_id, entry_date)
  where entry_type = 'today';

create unique index one_future_diary_per_author_creation_date
  on public.journal_entries(space_id, author_id, created_local_date)
  where entry_type = 'future';

create index space_members_user_id_idx
  on public.space_members(user_id)
  where active;

create index journal_entries_space_published_at_idx
  on public.journal_entries(space_id, published_at desc);

create index journal_entries_recipient_id_idx
  on public.journal_entries(recipient_id)
  where recipient_id is not null;

create or replace function public.enforce_two_active_space_members()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'UPDATE'
    and (new.space_id, new.user_id) is distinct from (old.space_id, old.user_id)
  then
    raise exception 'space member identity is immutable' using errcode = '23514';
  end if;

  if new.active then
    perform 1
    from public.spaces
    where id = new.space_id
    for update;

    if (
      select count(*)
      from public.space_members
      where space_id = new.space_id
        and active
        and user_id <> new.user_id
    ) >= 2 then
      raise exception 'a space can have at most two active members' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger space_members_enforce_active_limit
before insert or update on public.space_members
for each row execute function public.enforce_two_active_space_members();

create or replace function public.preserve_journal_entry_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
    or new.space_id is distinct from old.space_id
    or new.author_id is distinct from old.author_id
    or new.recipient_id is distinct from old.recipient_id
    or new.entry_type is distinct from old.entry_type
    or new.entry_date is distinct from old.entry_date
    or new.created_local_date is distinct from old.created_local_date
    or new.published_at is distinct from old.published_at
    or new.locked_at is distinct from old.locked_at
    or new.sealed_at is distinct from old.sealed_at
    or new.open_at is distinct from old.open_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'journal entry identity and schedule are immutable' using errcode = '23514';
  end if;

  if old.entry_type = 'future'
    and (
      new.title is distinct from old.title
      or new.content is distinct from old.content
      or new.image_path is distinct from old.image_path
    )
  then
    raise exception 'sealed future diary content is immutable' using errcode = '23514';
  end if;

  if old.opened_at is not null
    and (
      new.opened_at is distinct from old.opened_at
      or new.opened_by is distinct from old.opened_by
    )
  then
    raise exception 'journal open state is immutable once recorded' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger journal_entries_preserve_immutability
before update on public.journal_entries
for each row execute function public.preserve_journal_entry_immutability();

create trigger journal_entries_set_updated_at
before update on public.journal_entries
for each row execute function public.set_updated_at();

create or replace function public.is_active_space_member(
  requested_space_id uuid,
  requested_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.space_members
    where space_id = requested_space_id
      and user_id = requested_user_id
      and active
  );
$$;

alter table public.spaces enable row level security;

alter table public.space_members enable row level security;

alter table public.journal_entries enable row level security;

create policy "active members can read their space"
on public.spaces for select to authenticated
using (public.is_active_space_member(id));

create policy "active members can read memberships"
on public.space_members for select to authenticated
using (public.is_active_space_member(space_id));

create policy "active members can read visible journal entries"
on public.journal_entries for select to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    entry_type = 'today'
    or author_id = (select auth.uid())
    or (recipient_id = (select auth.uid()) and opened_at is not null)
  )
);

revoke all privileges on table public.spaces, public.space_members, public.journal_entries from anon, authenticated;

grant select on public.spaces, public.space_members, public.journal_entries to authenticated;

revoke execute on function public.enforce_two_active_space_members() from public, anon, authenticated;

revoke execute on function public.preserve_journal_entry_immutability() from public, anon, authenticated;

revoke execute on function public.is_active_space_member(uuid, uuid) from public, anon, authenticated;

grant execute on function public.is_active_space_member(uuid, uuid) to authenticated;


-- ============================================================================
-- Source history: 202607190002_journal_functions.sql
-- ============================================================================

create or replace function public.create_today_diary(
  p_space_id uuid,
  p_title text,
  p_content text,
  p_entry_date date,
  p_image_path text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_entry public.journal_entries;
begin
  if v_user_id is null or not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'active space membership required' using errcode = '42501';
  end if;
  if p_entry_date <> v_local_date then
    raise exception 'today diary date must be the current Shanghai date' using errcode = '22007';
  end if;

  insert into public.journal_entries (
    space_id, author_id, entry_type, title, content, image_path, entry_date,
    created_local_date, published_at, locked_at
  ) values (
    p_space_id, v_user_id, 'today', btrim(p_title), btrim(p_content), p_image_path,
    v_local_date, v_local_date, v_now, v_now + interval '24 hours'
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.seal_future_diary(
  p_space_id uuid,
  p_title text,
  p_content text,
  p_recipient_id uuid,
  p_open_at timestamptz,
  p_image_path text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_entry public.journal_entries;
begin
  if v_user_id is null or not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'active space membership required' using errcode = '42501';
  end if;
  if p_recipient_id = v_user_id or not exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = p_recipient_id
      and active
  ) then
    raise exception 'recipient must be the other active member' using errcode = '22023';
  end if;
  if p_open_at <= v_now then
    raise exception 'open time must be in the future' using errcode = '22007';
  end if;

  insert into public.journal_entries (
    space_id, author_id, recipient_id, entry_type, title, content, image_path,
    created_local_date, published_at, locked_at, sealed_at, open_at
  ) values (
    p_space_id, v_user_id, p_recipient_id, 'future', btrim(p_title), btrim(p_content),
    p_image_path, v_local_date, v_now, v_now, v_now, p_open_at
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.open_future_diary(p_entry_id uuid)
returns table (id uuid, opened_at timestamptz, opened_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_space_id uuid;
  v_recipient_id uuid;
  v_open_at timestamptz;
begin
  select journal.space_id, journal.recipient_id, journal.open_at
  into v_space_id, v_recipient_id, v_open_at
  from public.journal_entries as journal
    where journal.id = p_entry_id
      and journal.entry_type = 'future'
  for update;

  if not found then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_recipient_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_now < v_open_at then
    raise exception 'journal entry is not ready' using errcode = '55000';
  end if;

  return query
  update public.journal_entries
  set opened_at = coalesce(public.journal_entries.opened_at, now()),
      opened_by = coalesce(public.journal_entries.opened_by, auth.uid())
  where public.journal_entries.id = p_entry_id
  returning public.journal_entries.id,
            public.journal_entries.opened_at,
            public.journal_entries.opened_by;
end;
$$;

create or replace function public.update_today_diary(
  p_entry_id uuid,
  p_title text,
  p_content text,
  p_image_path text
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_author_id uuid;
  v_locked_at timestamptz;
  v_entry public.journal_entries;
begin
  select journal.space_id, journal.author_id, journal.locked_at
  into v_space_id, v_author_id, v_locked_at
  from public.journal_entries as journal
  where id = p_entry_id
    and entry_type = 'today'
  for update;

  if not found
    or v_author_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if clock_timestamp() > v_locked_at then
    raise exception 'journal entry is locked' using errcode = '55000';
  end if;

  update public.journal_entries
  set title = btrim(p_title), content = btrim(p_content), image_path = p_image_path
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.delete_today_diary(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_author_id uuid;
  v_locked_at timestamptz;
begin
  select journal.space_id, journal.author_id, journal.locked_at
  into v_space_id, v_author_id, v_locked_at
  from public.journal_entries as journal
  where id = p_entry_id
    and entry_type = 'today'
  for update;

  if not found
    or v_author_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if clock_timestamp() > v_locked_at then
    raise exception 'journal entry is locked' using errcode = '55000';
  end if;

  delete from public.journal_entries where id = p_entry_id;
  return p_entry_id;
end;
$$;

create or replace function public.list_future_diary_cards(p_box text)
returns table (
  id uuid,
  author_id uuid,
  recipient_id uuid,
  sealed_at timestamptz,
  open_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_box not in ('received', 'sent') then
    raise exception 'invalid future diary box' using errcode = '22023';
  end if;

  return query
  select journal.id, journal.author_id, journal.recipient_id, journal.sealed_at,
         journal.open_at, journal.opened_at, journal.created_at
  from public.journal_entries as journal
  where journal.entry_type = 'future'
    and public.is_active_space_member(journal.space_id, v_user_id)
    and (
      (p_box = 'received' and journal.recipient_id = v_user_id)
      or (p_box = 'sent' and journal.author_id = v_user_id)
    )
  order by journal.created_at desc;
end;
$$;

drop policy if exists "active members can read visible journal entries"
on public.journal_entries;

create policy "active members can read visible journal entries"
on public.journal_entries for select to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    entry_type = 'today'
    or author_id = (select auth.uid())
    or (recipient_id = (select auth.uid()) and opened_at is not null)
  )
);

revoke insert, update, delete on table public.journal_entries from anon, authenticated;

revoke execute on function public.create_today_diary(uuid, text, text, date, text) from public, anon, authenticated;

revoke execute on function public.seal_future_diary(uuid, text, text, uuid, timestamptz, text) from public, anon, authenticated;

revoke execute on function public.open_future_diary(uuid) from public, anon, authenticated;

revoke execute on function public.update_today_diary(uuid, text, text, text) from public, anon, authenticated;

revoke execute on function public.delete_today_diary(uuid) from public, anon, authenticated;

revoke execute on function public.list_future_diary_cards(text) from public, anon, authenticated;

grant execute on function public.create_today_diary(uuid, text, text, date, text) to authenticated;

grant execute on function public.seal_future_diary(uuid, text, text, uuid, timestamptz, text) to authenticated;

grant execute on function public.open_future_diary(uuid) to authenticated;

grant execute on function public.update_today_diary(uuid, text, text, text) to authenticated;

grant execute on function public.delete_today_diary(uuid) to authenticated;

grant execute on function public.list_future_diary_cards(text) to authenticated;


-- ============================================================================
-- Source history: 202607190003_interactions_and_storage.sql
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-images', 'journal-images', false, 819200, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.journal_image_cleanup_jobs (
  id bigint generated always as identity primary key,
  space_id uuid not null,
  author_id uuid not null,
  entry_id uuid not null,
  backup_id uuid,
  reason text not null check (reason in (
    'database_write_failed',
    'diary_deleted',
    'backup_cleanup_failed',
    'replacement_restore_failed'
  )),
  attempts integer not null default 0 check (attempts >= 0),
  requested_at timestamptz not null default now(),
  last_attempt_at timestamptz
);

create unique index journal_image_cleanup_jobs_target_key
on public.journal_image_cleanup_jobs (
  space_id,
  author_id,
  entry_id,
  reason,
  (coalesce(backup_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

alter table public.journal_image_cleanup_jobs enable row level security;

revoke all on table public.journal_image_cleanup_jobs from public, anon, authenticated;

grant select, update, delete on table public.journal_image_cleanup_jobs to service_role;

drop function if exists public.enqueue_journal_image_cleanup(uuid, uuid, text);

create or replace function public.enqueue_journal_image_cleanup(
  p_space_id uuid,
  p_entry_id uuid,
  p_reason text,
  p_backup_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_canonical_path text;
  v_target_path text;
begin
  if v_user_id is null
    or not public.is_active_space_member(p_space_id, v_user_id)
  then
    raise exception 'active space membership required' using errcode = '42501';
  end if;
  if p_reason not in (
    'database_write_failed',
    'diary_deleted',
    'backup_cleanup_failed',
    'replacement_restore_failed'
  ) then
    raise exception 'invalid cleanup reason' using errcode = '22023';
  end if;
  if (p_reason in ('backup_cleanup_failed', 'replacement_restore_failed')) <> (p_backup_id is not null) then
    raise exception 'cleanup target does not match reason' using errcode = '22023';
  end if;

  v_canonical_path := p_space_id::text || '/' || v_user_id::text || '/' || p_entry_id::text || '.webp';
  v_target_path := case
    when p_backup_id is null then v_canonical_path
    else p_space_id::text || '/' || v_user_id::text || '/.backups/'
      || p_entry_id::text || '/' || p_backup_id::text || '.webp'
  end;

  if p_backup_id is null and exists (
    select 1
    from public.journal_entries as journal
    where journal.id = p_entry_id
      and journal.space_id = p_space_id
      and journal.author_id = v_user_id
      and journal.image_path = v_canonical_path
      and (
        journal.entry_type <> 'today'
        or clock_timestamp() > journal.locked_at
      )
  ) then
    raise exception 'journal image is retained' using errcode = '55000';
  end if;

  if p_backup_id is not null and not exists (
    select 1
    from public.journal_entries as journal
    where journal.id = p_entry_id
      and journal.space_id = p_space_id
      and journal.author_id = v_user_id
      and journal.entry_type = 'today'
      and journal.image_path = v_canonical_path
  ) then
    raise exception 'backup provenance not found' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'journal-images'
      and object.name = v_target_path
      and object.owner_id = v_user_id::text
  ) then
    raise exception 'cleanup target not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_space_id::text || '/' || v_user_id::text, 0)
  );

  update public.journal_image_cleanup_jobs
  set requested_at = now()
  where space_id = p_space_id
    and author_id = v_user_id
    and entry_id = p_entry_id
    and reason = p_reason
    and backup_id is not distinct from p_backup_id;
  if found then
    return;
  end if;

  if (
    select count(*) >= 20
    from public.journal_image_cleanup_jobs
    where space_id = p_space_id
      and author_id = v_user_id
  ) then
    raise exception 'cleanup queue limit exceeded' using errcode = '54000';
  end if;

  insert into public.journal_image_cleanup_jobs (
    space_id, author_id, entry_id, backup_id, reason
  ) values (
    p_space_id, v_user_id, p_entry_id, p_backup_id, p_reason
  );
end;
$$;

revoke execute on function public.enqueue_journal_image_cleanup(uuid, uuid, text, uuid)
from public, anon, authenticated;

grant execute on function public.enqueue_journal_image_cleanup(uuid, uuid, text, uuid) to authenticated;

drop policy if exists "authors can upload journal images" on storage.objects;

create policy "authors can upload journal images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'journal-images'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.space_members as member
    where member.space_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.active
  )
  and (
    array_length(storage.foldername(name), 1) = 2
    or (
      array_length(storage.foldername(name), 1) = 4
      and (storage.foldername(name))[3] = '.backups'
      and exists (
        select 1
        from public.journal_entries as journal
        where journal.id::text = (storage.foldername(name))[4]
          and journal.space_id::text = (storage.foldername(name))[1]
          and journal.author_id = (select auth.uid())
          and journal.entry_type = 'today'
          and clock_timestamp() <= journal.locked_at
          and journal.image_path = journal.space_id::text || '/' || journal.author_id::text || '/' || journal.id::text || '.webp'
      )
    )
  )
);

drop policy if exists "authors can update journal images" on storage.objects;

create policy "authors can update journal images"
on storage.objects for update to authenticated
using (
  bucket_id = 'journal-images'
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.journal_entries as journal
    where journal.id::text || '.webp' = storage.filename(name)
      and journal.space_id::text = (storage.foldername(name))[1]
      and journal.author_id = (select auth.uid())
      and journal.entry_type = 'today'
      and clock_timestamp() <= journal.locked_at
      and journal.image_path = storage.objects.name
  )
)
with check (
  bucket_id = 'journal-images'
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.space_members as member
    where member.space_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.active
  )
  and exists (
    select 1
    from public.journal_entries as journal
    where journal.id::text || '.webp' = storage.filename(name)
      and journal.space_id::text = (storage.foldername(name))[1]
      and journal.author_id = (select auth.uid())
      and journal.entry_type = 'today'
      and clock_timestamp() <= journal.locked_at
      and journal.image_path = storage.objects.name
  )
);

drop policy if exists "authors can remove journal images" on storage.objects;

create policy "authors can remove journal images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'journal-images'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.space_members as member
    where member.space_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.active
  )
  and (
    (
      array_length(storage.foldername(name), 1) = 2
      and (
        not exists (
          select 1
          from public.journal_entries as journal
          where journal.image_path = storage.objects.name
        )
        or exists (
          select 1
          from public.journal_entries as journal
          where journal.image_path = storage.objects.name
            and journal.entry_type = 'today'
            and journal.author_id = (select auth.uid())
            and clock_timestamp() <= journal.locked_at
        )
      )
    )
    or (
      array_length(storage.foldername(name), 1) = 4
      and (storage.foldername(name))[3] = '.backups'
      and exists (
        select 1
        from public.journal_entries as journal
        where journal.id::text = (storage.foldername(name))[4]
          and journal.space_id::text = (storage.foldername(name))[1]
          and journal.author_id = (select auth.uid())
          and journal.entry_type = 'today'
          and journal.image_path = journal.space_id::text || '/' || journal.author_id::text || '/' || journal.id::text || '.webp'
      )
    )
  )
);

drop policy if exists "authorized readers can read journal images" on storage.objects;

create policy "authorized readers can read journal images"
on storage.objects for select to authenticated
using (
  bucket_id = 'journal-images'
  and (
    exists (
      select 1
      from public.journal_entries as journal
      where journal.image_path = storage.objects.name
        and journal.image_path = journal.space_id::text || '/' || journal.author_id::text || '/' || journal.id::text || '.webp'
        and public.is_active_space_member(journal.space_id, auth.uid())
        and (
          journal.entry_type = 'today'
          or journal.author_id = (select auth.uid())
          or (
            journal.recipient_id = (select auth.uid())
            and journal.opened_at is not null
          )
        )
    )
    or (
      owner_id = (select auth.uid())::text
      and array_length(storage.foldername(name), 1) = 4
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and (storage.foldername(name))[3] = '.backups'
      and exists (
        select 1
        from public.journal_entries as journal
        where journal.id::text = (storage.foldername(name))[4]
          and journal.space_id::text = (storage.foldername(name))[1]
          and journal.author_id = (select auth.uid())
          and journal.entry_type = 'today'
          and journal.image_path = journal.space_id::text || '/' || journal.author_id::text || '/' || journal.id::text || '.webp'
          and public.is_active_space_member(journal.space_id, auth.uid())
      )
    )
  )
);

drop function if exists public.create_today_diary(uuid, text, text, date, text);

create or replace function public.create_today_diary(
  p_space_id uuid,
  p_title text,
  p_content text,
  p_entry_date date,
  p_image_path text default null,
  p_entry_id uuid default gen_random_uuid()
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_entry public.journal_entries;
begin
  if v_user_id is null or not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'active space membership required' using errcode = '42501';
  end if;
  if p_entry_id is null then
    raise exception 'entry id is required' using errcode = '22023';
  end if;
  if p_entry_date <> v_local_date then
    raise exception 'today diary date must be the current Shanghai date' using errcode = '22007';
  end if;
  if p_image_path is not null
    and p_image_path <> p_space_id::text || '/' || v_user_id::text || '/' || p_entry_id::text || '.webp'
  then
    raise exception 'invalid journal image path' using errcode = '22023';
  end if;

  insert into public.journal_entries (
    id, space_id, author_id, entry_type, title, content, image_path, entry_date,
    created_local_date, published_at, locked_at
  ) values (
    p_entry_id, p_space_id, v_user_id, 'today', btrim(p_title), btrim(p_content),
    p_image_path, v_local_date, v_local_date, v_now, v_now + interval '24 hours'
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

drop function if exists public.seal_future_diary(uuid, text, text, uuid, timestamptz, text);

create or replace function public.seal_future_diary(
  p_space_id uuid,
  p_title text,
  p_content text,
  p_recipient_id uuid,
  p_open_at timestamptz,
  p_image_path text default null,
  p_entry_id uuid default gen_random_uuid()
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_entry public.journal_entries;
begin
  if v_user_id is null or not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'active space membership required' using errcode = '42501';
  end if;
  if p_entry_id is null then
    raise exception 'entry id is required' using errcode = '22023';
  end if;
  if p_recipient_id = v_user_id or not exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = p_recipient_id
      and active
  ) then
    raise exception 'recipient must be the other active member' using errcode = '22023';
  end if;
  if p_open_at <= v_now then
    raise exception 'open time must be in the future' using errcode = '22007';
  end if;
  if p_image_path is not null
    and p_image_path <> p_space_id::text || '/' || v_user_id::text || '/' || p_entry_id::text || '.webp'
  then
    raise exception 'invalid journal image path' using errcode = '22023';
  end if;

  insert into public.journal_entries (
    id, space_id, author_id, recipient_id, entry_type, title, content, image_path,
    created_local_date, published_at, locked_at, sealed_at, open_at
  ) values (
    p_entry_id, p_space_id, v_user_id, p_recipient_id, 'future', btrim(p_title),
    btrim(p_content), p_image_path, v_local_date, v_now, v_now, v_now, p_open_at
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.update_today_diary(
  p_entry_id uuid,
  p_title text,
  p_content text,
  p_image_path text
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_author_id uuid;
  v_locked_at timestamptz;
  v_entry public.journal_entries;
begin
  select journal.space_id, journal.author_id, journal.locked_at
  into v_space_id, v_author_id, v_locked_at
  from public.journal_entries as journal
  where id = p_entry_id
    and entry_type = 'today'
  for update;

  if not found
    or v_author_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if clock_timestamp() > v_locked_at then
    raise exception 'journal entry is locked' using errcode = '55000';
  end if;
  if p_image_path is not null
    and p_image_path <> v_space_id::text || '/' || v_author_id::text || '/' || p_entry_id::text || '.webp'
  then
    raise exception 'invalid journal image path' using errcode = '22023';
  end if;

  update public.journal_entries
  set title = btrim(p_title), content = btrim(p_content), image_path = p_image_path
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke execute on function public.create_today_diary(uuid, text, text, date, text, uuid)
from public, anon, authenticated;

revoke execute on function public.seal_future_diary(uuid, text, text, uuid, timestamptz, text, uuid)
from public, anon, authenticated;

revoke execute on function public.update_today_diary(uuid, text, text, text)
from public, anon, authenticated;

grant execute on function public.create_today_diary(uuid, text, text, date, text, uuid)
to authenticated;

grant execute on function public.seal_future_diary(uuid, text, text, uuid, timestamptz, text, uuid)
to authenticated;

grant execute on function public.update_today_diary(uuid, text, text, text)
to authenticated;

alter table public.annotation_replies rename to letter_annotation_replies;

drop policy if exists "couple members can create notifications"
on public.notifications;

revoke insert on table public.notifications from public, anon, authenticated;

alter type public.notification_type add value if not exists 'future_diary_opened';

alter table public.notifications
add column future_diary_opened boolean not null default false;

alter table public.notifications
add constraint notifications_future_diary_opened_type_check
check (future_diary_opened = (type::text = 'future_diary_opened'));

create table public.journal_comments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (
    char_length(normalize(btrim(body), NFC)) between 1 and 20000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.journal_annotations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  block_id text not null check (block_id = 'body'),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  quoted_text text not null check (char_length(quoted_text) between 1 and 20000),
  comment text not null check (char_length(btrim(comment)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.annotation_replies (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  annotation_id uuid not null references public.journal_annotations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journal_comments_entry_created_idx
on public.journal_comments(entry_id, created_at, id);

create index journal_annotations_entry_created_idx
on public.journal_annotations(entry_id, created_at, id);

create index annotation_replies_annotation_created_idx
on public.annotation_replies(annotation_id, created_at, id);

create unique index notifications_recipient_type_source_key
on public.notifications(recipient_id, type, source_id)
where future_diary_opened;

create or replace function public.can_interact_with_journal(
  requested_entry_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.journal_entries as journal
    where journal.id = requested_entry_id
      and public.is_active_space_member(journal.space_id, auth.uid())
      and (
        journal.entry_type = 'today'
        or (
          journal.entry_type = 'future'
          and journal.opened_at is not null
          and (
            journal.author_id = auth.uid()
            or journal.recipient_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.preserve_journal_interaction_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
    or new.space_id is distinct from old.space_id
    or new.entry_id is distinct from old.entry_id
    or new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'journal interaction identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.preserve_annotation_reply_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
    or new.space_id is distinct from old.space_id
    or new.entry_id is distinct from old.entry_id
    or new.annotation_id is distinct from old.annotation_id
    or new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'annotation reply identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger journal_comments_preserve_identity
before update on public.journal_comments
for each row execute function public.preserve_journal_interaction_identity();

create trigger journal_annotations_preserve_identity
before update on public.journal_annotations
for each row execute function public.preserve_journal_interaction_identity();

create trigger annotation_replies_preserve_identity
before update on public.annotation_replies
for each row execute function public.preserve_annotation_reply_identity();

create trigger journal_comments_set_updated_at
before update on public.journal_comments
for each row execute function public.set_updated_at();

create trigger journal_annotations_set_updated_at
before update on public.journal_annotations
for each row execute function public.set_updated_at();

create trigger annotation_replies_set_updated_at
before update on public.annotation_replies
for each row execute function public.set_updated_at();

alter table public.journal_comments enable row level security;

alter table public.journal_annotations enable row level security;

alter table public.annotation_replies enable row level security;

create policy "members can read eligible journal comments"
on public.journal_comments for select to authenticated
using (
  public.can_interact_with_journal(entry_id)
  and exists (
    select 1 from public.journal_entries as journal
    where journal.id = journal_comments.entry_id
      and journal.space_id = journal_comments.space_id
  )
);

create policy "members can read eligible journal annotations"
on public.journal_annotations for select to authenticated
using (
  public.can_interact_with_journal(entry_id)
  and exists (
    select 1 from public.journal_entries as journal
    where journal.id = journal_annotations.entry_id
      and journal.space_id = journal_annotations.space_id
  )
);

create policy "members can read eligible annotation replies"
on public.annotation_replies for select to authenticated
using (
  public.can_interact_with_journal(entry_id)
  and exists (
    select 1
    from public.journal_annotations as annotation
    where annotation.id = annotation_replies.annotation_id
      and annotation.entry_id = annotation_replies.entry_id
      and annotation.space_id = annotation_replies.space_id
  )
);

revoke all on table public.journal_comments, public.journal_annotations, public.annotation_replies
from public, anon, authenticated;

grant select on table public.journal_comments, public.journal_annotations, public.annotation_replies
to authenticated;

revoke insert, update, delete on table public.journal_comments from anon, authenticated;

revoke insert, update, delete on table public.journal_annotations from anon, authenticated;

revoke insert, update, delete on table public.annotation_replies from anon, authenticated;

create or replace function public.create_journal_comment(
  p_actor_id uuid,
  p_entry_id uuid,
  p_body text
)
returns public.journal_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_comment public.journal_comments;
begin
  select journal.space_id into v_space_id
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and public.is_active_space_member(journal.space_id, p_actor_id)
    and (
      journal.entry_type = 'today'
      or (
        journal.entry_type = 'future'
        and journal.opened_at is not null
        and (journal.author_id = p_actor_id or journal.recipient_id = p_actor_id)
      )
    )
  for share;
  if not found then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if p_body is null
    or char_length(normalize(btrim(p_body), NFC)) not between 1 and 20000
  then
    raise exception 'invalid comment' using errcode = '22023';
  end if;

  insert into public.journal_comments(space_id, entry_id, author_id, body)
  values (v_space_id, p_entry_id, p_actor_id, btrim(p_body))
  returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.update_journal_comment(
  p_actor_id uuid,
  p_comment_id uuid,
  p_body text
)
returns public.journal_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment public.journal_comments;
begin
  select comment.* into v_comment
  from public.journal_comments as comment
  join public.journal_entries as journal
    on comment.entry_id = journal.id
   and comment.space_id = journal.space_id
  where comment.id = p_comment_id
    and comment.author_id = p_actor_id
    and clock_timestamp() <= comment.created_at + interval '4 hours'
    and public.is_active_space_member(journal.space_id, p_actor_id)
    and (
      journal.entry_type = 'today'
      or (
        journal.entry_type = 'future'
        and journal.opened_at is not null
        and (journal.author_id = p_actor_id or journal.recipient_id = p_actor_id)
      )
    )
  for update;
  if not found then
    raise exception 'comment not found or immutable' using errcode = 'P0002';
  end if;
  if p_body is null
    or char_length(normalize(btrim(p_body), NFC)) not between 1 and 20000
  then
    raise exception 'invalid comment' using errcode = '22023';
  end if;
  update public.journal_comments set body = btrim(p_body)
  where id = p_comment_id and author_id = p_actor_id
  returning * into v_comment;
  return v_comment;
end;
$$;

create or replace function public.delete_journal_comment(p_comment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment public.journal_comments;
begin
  select comment.* into v_comment
  from public.journal_comments as comment
  where comment.id = p_comment_id
    and comment.author_id = auth.uid()
    and clock_timestamp() <= comment.created_at + interval '4 hours'
  for update;
  if not found or not public.can_interact_with_journal(v_comment.entry_id) then
    raise exception 'comment not found or immutable' using errcode = 'P0002';
  end if;
  delete from public.journal_comments where id = p_comment_id;
  return p_comment_id;
end;
$$;

create or replace function public.create_journal_annotation(
  p_entry_id uuid,
  p_block_id text,
  p_start_offset integer,
  p_end_offset integer,
  p_quoted_text text,
  p_comment text
)
returns public.journal_annotations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_content text;
  v_annotation public.journal_annotations;
begin
  select journal.space_id, journal.content into v_space_id, v_content
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and public.can_interact_with_journal(journal.id)
  for share;
  if not found then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if p_block_id <> 'body'
    or p_start_offset < 0
    or p_end_offset <= p_start_offset
    or p_end_offset > char_length(v_content)
    or substring(v_content from p_start_offset + 1 for p_end_offset - p_start_offset)
      is distinct from p_quoted_text
  then
    raise exception 'invalid annotation anchor' using errcode = '22023';
  end if;
  if char_length(btrim(p_comment)) not between 1 and 20000 then
    raise exception 'invalid annotation comment' using errcode = '22023';
  end if;

  insert into public.journal_annotations(
    space_id, entry_id, author_id, block_id, start_offset, end_offset,
    quoted_text, comment
  ) values (
    v_space_id, p_entry_id, auth.uid(), p_block_id, p_start_offset, p_end_offset,
    p_quoted_text, btrim(p_comment)
  ) returning * into v_annotation;
  return v_annotation;
end;
$$;

create or replace function public.update_journal_annotation(p_annotation_id uuid, p_comment text)
returns public.journal_annotations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_annotation public.journal_annotations;
begin
  select annotation.* into v_annotation
  from public.journal_annotations as annotation
  where annotation.id = p_annotation_id and annotation.author_id = auth.uid()
  for update;
  if not found or not public.can_interact_with_journal(v_annotation.entry_id) then
    raise exception 'annotation not found' using errcode = 'P0002';
  end if;
  if char_length(btrim(p_comment)) not between 1 and 20000 then
    raise exception 'invalid annotation comment' using errcode = '22023';
  end if;
  update public.journal_annotations set comment = btrim(p_comment)
  where id = p_annotation_id returning * into v_annotation;
  return v_annotation;
end;
$$;

create or replace function public.delete_journal_annotation(p_annotation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_annotation public.journal_annotations;
begin
  select annotation.* into v_annotation
  from public.journal_annotations as annotation
  where annotation.id = p_annotation_id and annotation.author_id = auth.uid()
  for update;
  if not found or not public.can_interact_with_journal(v_annotation.entry_id) then
    raise exception 'annotation not found' using errcode = 'P0002';
  end if;
  delete from public.journal_annotations where id = p_annotation_id;
  return p_annotation_id;
end;
$$;

create or replace function public.create_annotation_reply(p_annotation_id uuid, p_body text)
returns public.annotation_replies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_annotation public.journal_annotations;
  v_reply public.annotation_replies;
begin
  select annotation.* into v_annotation
  from public.journal_annotations as annotation
  where annotation.id = p_annotation_id;
  if not found or not public.can_interact_with_journal(v_annotation.entry_id) then
    raise exception 'annotation not found' using errcode = 'P0002';
  end if;
  if char_length(btrim(p_body)) not between 1 and 20000 then
    raise exception 'invalid annotation reply' using errcode = '22023';
  end if;
  insert into public.annotation_replies(space_id, entry_id, annotation_id, author_id, body)
  values (
    v_annotation.space_id, v_annotation.entry_id, p_annotation_id, auth.uid(), btrim(p_body)
  ) returning * into v_reply;
  return v_reply;
end;
$$;

create or replace function public.update_annotation_reply(p_reply_id uuid, p_body text)
returns public.annotation_replies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply public.annotation_replies;
begin
  select reply.* into v_reply
  from public.annotation_replies as reply
  where reply.id = p_reply_id and reply.author_id = auth.uid()
  for update;
  if not found or not public.can_interact_with_journal(v_reply.entry_id) then
    raise exception 'annotation reply not found' using errcode = 'P0002';
  end if;
  if char_length(btrim(p_body)) not between 1 and 20000 then
    raise exception 'invalid annotation reply' using errcode = '22023';
  end if;
  update public.annotation_replies set body = btrim(p_body)
  where id = p_reply_id returning * into v_reply;
  return v_reply;
end;
$$;

create or replace function public.delete_annotation_reply(p_reply_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply public.annotation_replies;
begin
  select reply.* into v_reply
  from public.annotation_replies as reply
  where reply.id = p_reply_id and reply.author_id = auth.uid()
  for update;
  if not found or not public.can_interact_with_journal(v_reply.entry_id) then
    raise exception 'annotation reply not found' using errcode = 'P0002';
  end if;
  delete from public.annotation_replies where id = p_reply_id;
  return p_reply_id;
end;
$$;

create or replace function public.resolve_single_active_space(p_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_match_count bigint;
begin
  select count(*), (array_agg(member.space_id))[1]
  into v_match_count, v_space_id
  from public.space_members as member
  where member.user_id = p_user_id
    and member.active;

  if v_match_count <> 1 then
    raise exception 'unique active space membership required' using errcode = '42501';
  end if;
  return v_space_id;
end;
$$;

create or replace function public.create_legacy_notification(
  p_kind text,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_space_id uuid;
  v_source_actor_id uuid;
  v_actor_name text;
  v_recipient_id uuid;
  v_notification_source_id uuid;
  v_title text;
  v_body text;
  v_event record;
begin
  if v_actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  v_space_id := public.resolve_single_active_space(v_actor_id);

  if p_kind = 'annotation' then
    select profile.display_name, annotation.author_id, letter.author_id, annotation.letter_id,
           annotation.quoted_text
    into v_actor_name, v_source_actor_id, v_recipient_id, v_notification_source_id, v_body
    from public.annotations as annotation
    join public.letters as letter on letter.id = annotation.letter_id
    join public.profiles as profile on profile.id = annotation.author_id
    where annotation.id = p_source_id
      and annotation.author_id = v_actor_id;
    v_title := v_actor_name || ' 评点了你的信';
    v_body := left(v_body, 60);
  elsif p_kind = 'annotation_reply' then
    select profile.display_name, reply.author_id,
           case when annotation.author_id = reply.author_id
             then letter.author_id else annotation.author_id end,
           annotation.letter_id,
           reply.body
    into v_actor_name, v_source_actor_id, v_recipient_id, v_notification_source_id, v_body
    from public.letter_annotation_replies as reply
    join public.annotations as annotation on annotation.id = reply.annotation_id
    join public.letters as letter on letter.id = annotation.letter_id
    join public.profiles as profile on profile.id = reply.author_id
    where reply.id = p_source_id
      and reply.author_id = v_actor_id;
    v_title := v_actor_name || ' 回复了评点';
    v_body := left(v_body, 80);
  elsif p_kind = 'letter_opened' then
    select profile.display_name, response.reader_id, letter.author_id, letter.id,
           response.response_text
    into v_actor_name, v_source_actor_id, v_recipient_id, v_notification_source_id, v_body
    from public.letter_open_responses as response
    join public.letters as letter on letter.id = response.letter_id
    join public.profiles as profile on profile.id = response.reader_id
    where response.letter_id = p_source_id
      and response.reader_id = v_actor_id;
    v_title := v_actor_name || ' 展开了你的信';
    v_body := '回应：' || v_body;
  elsif p_kind = 'calendar_event' then
    select event.id, event.name, event.creator_id into v_event
    from public.calendar_events as event
    where event.id = p_source_id;
    if not found then
      raise exception 'notification source not found' using errcode = 'P0002';
    end if;

    v_source_actor_id := v_event.creator_id;
    if public.resolve_single_active_space(v_source_actor_id) is distinct from v_space_id then
      raise exception 'legacy notification source is outside caller space' using errcode = '42501';
    end if;

    for v_recipient_id in
      select member.user_id
      from public.space_members as member
      where member.space_id = v_space_id
        and member.active
    loop
      if public.resolve_single_active_space(v_recipient_id) is distinct from v_space_id then
        raise exception 'legacy notification recipient is outside caller space' using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.notifications as notification
        where notification.recipient_id = v_recipient_id
          and notification.type = 'calendar_event'
          and notification.source_id = v_event.id
          and (notification.created_at at time zone 'Asia/Shanghai')::date =
              (now() at time zone 'Asia/Shanghai')::date
        ) then
        insert into public.notifications(recipient_id, type, source_id, title, body)
        values (v_recipient_id, 'calendar_event', v_event.id, '今日提醒', v_event.name);
      end if;
    end loop;
    return;
  else
    raise exception 'unsupported notification kind' using errcode = '22023';
  end if;

  if not found then
    raise exception 'notification source not found' using errcode = 'P0002';
  end if;
  if public.resolve_single_active_space(v_source_actor_id) is distinct from v_space_id then
    raise exception 'legacy notification source is outside caller space' using errcode = '42501';
  end if;
  if public.resolve_single_active_space(v_recipient_id) is distinct from v_space_id then
    raise exception 'legacy notification recipient is outside caller space' using errcode = '42501';
  end if;
  if v_recipient_id = v_actor_id then
    return;
  end if;

  insert into public.notifications(recipient_id, type, source_id, title, body)
  values (
    v_recipient_id,
    p_kind::public.notification_type,
    v_notification_source_id,
    v_title,
    v_body
  );
end;
$$;

create or replace function public.open_future_diary(p_entry_id uuid)
returns table (id uuid, opened_at timestamptz, opened_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_space_id uuid;
  v_author_id uuid;
  v_recipient_id uuid;
  v_open_at timestamptz;
begin
  select journal.space_id, journal.author_id, journal.recipient_id, journal.open_at
  into v_space_id, v_author_id, v_recipient_id, v_open_at
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and journal.entry_type = 'future'
  for update;

  if not found
    or v_recipient_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_now < v_open_at then
    raise exception 'journal entry is not ready' using errcode = '55000';
  end if;

  update public.journal_entries
  set opened_at = coalesce(public.journal_entries.opened_at, v_now),
      opened_by = coalesce(public.journal_entries.opened_by, auth.uid())
  where public.journal_entries.id = p_entry_id;

  insert into public.notifications(
    recipient_id, type, source_id, title, body, future_diary_opened
  )
  values (
    v_author_id,
    'future_diary_opened'::text::public.notification_type,
    p_entry_id,
    '未来日记已被开启',
    '对方打开了你封存的未来日记。',
    true
  )
  on conflict (recipient_id, type, source_id)
  where future_diary_opened
  do nothing;

  return query
  select journal.id, journal.opened_at, journal.opened_by
  from public.journal_entries as journal
  where journal.id = p_entry_id;
end;
$$;

revoke execute on function public.can_interact_with_journal(uuid) from public, anon, authenticated;

revoke execute on function public.preserve_journal_interaction_identity() from public, anon, authenticated;

revoke execute on function public.preserve_annotation_reply_identity() from public, anon, authenticated;

revoke execute on function public.create_journal_comment(uuid, uuid, text) from public, anon, authenticated;

revoke execute on function public.update_journal_comment(uuid, uuid, text) from public, anon, authenticated;

revoke execute on function public.delete_journal_comment(uuid) from public, anon, authenticated;

revoke execute on function public.create_journal_annotation(uuid, text, integer, integer, text, text) from public, anon, authenticated;

revoke execute on function public.update_journal_annotation(uuid, text) from public, anon, authenticated;

revoke execute on function public.delete_journal_annotation(uuid) from public, anon, authenticated;

revoke execute on function public.create_annotation_reply(uuid, text) from public, anon, authenticated;

revoke execute on function public.update_annotation_reply(uuid, text) from public, anon, authenticated;

revoke execute on function public.delete_annotation_reply(uuid) from public, anon, authenticated;

revoke execute on function public.resolve_single_active_space(uuid) from public, anon, authenticated;

revoke execute on function public.create_legacy_notification(text, uuid) from public, anon, authenticated;

grant execute on function public.create_journal_comment(uuid, uuid, text) to service_role;

grant execute on function public.can_interact_with_journal(uuid) to authenticated;

grant execute on function public.update_journal_comment(uuid, uuid, text) to service_role;

grant execute on function public.delete_journal_comment(uuid) to authenticated;

grant execute on function public.create_journal_annotation(uuid, text, integer, integer, text, text) to authenticated;

grant execute on function public.update_journal_annotation(uuid, text) to authenticated;

grant execute on function public.delete_journal_annotation(uuid) to authenticated;

grant execute on function public.create_annotation_reply(uuid, text) to authenticated;

grant execute on function public.update_annotation_reply(uuid, text) to authenticated;

grant execute on function public.delete_annotation_reply(uuid) to authenticated;

grant execute on function public.create_legacy_notification(text, uuid) to authenticated;


-- ============================================================================
-- Source history: 202607190004_product_integration.sql
-- ============================================================================

alter table public.profiles
  add column if not exists display_preferences jsonb not null default '{"compactCalendar":false}'::jsonb;

alter table public.calendar_events add column space_id uuid references public.spaces(id) on delete restrict;

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

create or replace function public.shares_active_space(
  requested_user_id uuid,
  viewer_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = '' as $$
  select viewer_user_id is not null and (
    requested_user_id = viewer_user_id
    or exists (
      select 1
      from public.space_members as requested_member
      join public.space_members as viewer_member
        on viewer_member.space_id = requested_member.space_id
      where requested_member.user_id = requested_user_id
        and requested_member.active
        and viewer_member.user_id = viewer_user_id
        and viewer_member.active
    )
  );
$$;

drop policy if exists "couple members can read profiles" on public.profiles;

create policy "users can read self and active space profiles" on public.profiles
for select to authenticated using (public.shares_active_space(id));

revoke execute on function public.shares_active_space(uuid, uuid) from public, anon, authenticated;

grant execute on function public.shares_active_space(uuid, uuid) to authenticated;

create or replace function public.calendar_event_occurs_on(
  event_date date,
  event_recurrence public.recurrence_type,
  target_date date
) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_candidate date;
  v_last_day integer;
begin
  if event_date > target_date then return false; end if;
  if event_recurrence = 'none' then return event_date = target_date; end if;
  if event_recurrence = 'yearly' and extract(month from event_date) <> extract(month from target_date) then
    return false;
  end if;
  v_last_day := extract(day from (
    date_trunc('month', target_date::timestamp) + interval '1 month - 1 day'
  ));
  v_candidate := make_date(
    extract(year from target_date)::integer,
    extract(month from target_date)::integer,
    least(extract(day from event_date)::integer, v_last_day)
  );
  return v_candidate = target_date;
end;
$$;

alter function public.create_legacy_notification(text, uuid)
  rename to create_legacy_notification_task7;

create or replace function public.create_legacy_notification(
  p_kind text,
  p_source_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := auth.uid();
  v_space_id uuid;
  v_recipient_id uuid;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_event record;
begin
  if p_kind <> 'calendar_event' then
    perform public.create_legacy_notification_task7(p_kind, p_source_id);
    return;
  end if;
  if v_actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  v_space_id := public.resolve_single_active_space(v_actor_id);

  select event.id, event.name, event.creator_id, event.space_id, event.event_date, event.recurrence
  into v_event
  from public.calendar_events as event
  where event.id = p_source_id
    and event.space_id = v_space_id
    and public.is_active_space_member(event.space_id, event.creator_id);
  if not found then
    raise exception 'calendar notification source is outside caller space' using errcode = '42501';
  end if;
  if not public.calendar_event_occurs_on(v_event.event_date, v_event.recurrence, v_today) then
    raise exception 'calendar event is not due today' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_event.id::text || ':' || v_today::text, 0)
  );

  for v_recipient_id in
    select member.user_id from public.space_members as member
    where member.space_id = v_space_id and member.active
  loop
    if not exists (
      select 1 from public.notifications as notification
      where notification.recipient_id = v_recipient_id
        and notification.type = 'calendar_event'
        and notification.source_id = v_event.id
        and (notification.created_at at time zone 'Asia/Shanghai')::date = v_today
    ) then
      insert into public.notifications(recipient_id, type, source_id, title, body)
      values (v_recipient_id, 'calendar_event', v_event.id, '今日提醒', v_event.name);
    end if;
  end loop;
end;
$$;

revoke execute on function public.calendar_event_occurs_on(date, public.recurrence_type, date) from public, anon, authenticated;

revoke execute on function public.create_legacy_notification_task7(text, uuid) from public, anon, authenticated;

revoke execute on function public.create_legacy_notification(text, uuid) from public, anon;

grant execute on function public.create_legacy_notification(text, uuid) to authenticated;


-- ============================================================================
-- Source history: 202607230001_fix_open_future_diary.sql
-- ============================================================================

create or replace function public.open_future_diary(p_entry_id uuid)
returns table (id uuid, opened_at timestamptz, opened_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_space_id uuid;
  v_recipient_id uuid;
  v_open_at timestamptz;
begin
  select journal.space_id, journal.recipient_id, journal.open_at
  into v_space_id, v_recipient_id, v_open_at
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and journal.entry_type = 'future'
  for update;

  if not found then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_recipient_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_now < v_open_at then
    raise exception 'journal entry is not ready' using errcode = '55000';
  end if;

  return query
  update public.journal_entries
  set opened_at = coalesce(public.journal_entries.opened_at, now()),
      opened_by = coalesce(public.journal_entries.opened_by, auth.uid())
  where public.journal_entries.id = p_entry_id
  returning public.journal_entries.id,
            public.journal_entries.opened_at,
            public.journal_entries.opened_by;
end;
$$;

revoke execute on function public.open_future_diary(uuid) from public, anon;

grant execute on function public.open_future_diary(uuid) to authenticated;


-- ============================================================================
-- Source history: 202607230002_restore_future_diary_open_notification.sql
-- ============================================================================

create or replace function public.open_future_diary(p_entry_id uuid)
returns table (id uuid, opened_at timestamptz, opened_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_space_id uuid;
  v_author_id uuid;
  v_recipient_id uuid;
  v_open_at timestamptz;
begin
  select journal.space_id, journal.author_id, journal.recipient_id, journal.open_at
  into v_space_id, v_author_id, v_recipient_id, v_open_at
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and journal.entry_type = 'future'
  for update;

  if not found
    or v_recipient_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_now < v_open_at then
    raise exception 'journal entry is not ready' using errcode = '55000';
  end if;

  update public.journal_entries
  set opened_at = coalesce(public.journal_entries.opened_at, v_now),
      opened_by = coalesce(public.journal_entries.opened_by, auth.uid())
  where public.journal_entries.id = p_entry_id;

  insert into public.notifications(
    recipient_id, type, source_id, title, body, future_diary_opened
  )
  values (
    v_author_id,
    'future_diary_opened'::text::public.notification_type,
    p_entry_id,
    '未来日记已被开启',
    '对方打开了你封存的未来日记。',
    true
  )
  on conflict (recipient_id, type, source_id)
  where future_diary_opened
  do nothing;

  return query
  select journal.id, journal.opened_at, journal.opened_by
  from public.journal_entries as journal
  where journal.id = p_entry_id;
end;
$$;

revoke execute on function public.open_future_diary(uuid) from public, anon;

grant execute on function public.open_future_diary(uuid) to authenticated;


-- ============================================================================
-- Source history: 202607250001_mood_edit_window.sql
-- ============================================================================

create or replace function public.update_mood_entry(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_content text := btrim(coalesce(p_body, ''));
begin
  if v_actor is null
     or char_length(v_content) not between 1 and 60 then
    raise exception 'invalid mood entry' using errcode = '22023';
  end if;

  update public.mood_entries as mood
  set body = v_content,
      emoji = ''
  where mood.id = p_id
    and mood.author_id = v_actor
    and mood.created_at > now() - interval '24 hours'
    and public.is_active_space_member(mood.space_id, v_actor);

  if not found then
    raise exception 'mood edit window closed' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_mood_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.mood_entries as mood
  where mood.id = p_id
    and mood.author_id = v_actor
    and mood.created_at > now() - interval '24 hours'
    and public.is_active_space_member(mood.space_id, v_actor);

  if not found then
    raise exception 'mood delete window closed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.update_mood_entry(uuid, text) from public, anon;

revoke execute on function public.delete_mood_entry(uuid) from public, anon;

grant execute on function public.update_mood_entry(uuid, text) to authenticated;

grant execute on function public.delete_mood_entry(uuid) to authenticated;


-- ============================================================================
-- Source history: 202607250002_independent_memories.sql
-- ============================================================================

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


-- ============================================================================
-- Source history: 202607260001_home_activity_and_location_history.sql
-- ============================================================================

alter type public.notification_type add value if not exists 'memory_created';

alter type public.notification_type add value if not exists 'mood_created';

alter type public.notification_type add value if not exists 'profile_updated';

alter type public.notification_type add value if not exists 'journal_created';

create table if not exists public.location_history (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  latitude double precision not null,
  longitude double precision not null,
  country text,
  region text,
  city text,
  source text not null default 'manual' check (source in ('manual', 'login_confirmed', 'stale_confirmed')),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists location_history_space_recorded_idx on public.location_history(space_id, recorded_at desc);

alter table public.location_history enable row level security;

drop policy if exists "active members read location history" on public.location_history;

create policy "active members read location history" on public.location_history for select to authenticated
using (public.is_active_space_member(space_id));

revoke all on table public.location_history from anon, authenticated;

grant select on table public.location_history to authenticated;

create or replace function public.record_location_history(
  p_space_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_country text,
  p_region text,
  p_city text,
  p_source text default 'manual'
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := auth.uid(); v_id uuid; v_recent uuid;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'location access denied' using errcode='42501';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode='22023';
  end if;
  select id into v_recent from public.location_history
  where user_id=v_actor and recorded_at > now()-interval '10 minutes'
    and coalesce(city,'')=coalesce(nullif(btrim(p_city),''),'')
  order by recorded_at desc limit 1;
  if v_recent is not null then
    update public.location_history set latitude=p_latitude, longitude=p_longitude,
      country=nullif(btrim(p_country),''), region=nullif(btrim(p_region),''), city=nullif(btrim(p_city),''),
      source=p_source, recorded_at=now() where id=v_recent returning id into v_id;
  else
    insert into public.location_history(space_id,user_id,latitude,longitude,country,region,city,source)
    values(p_space_id,v_actor,p_latitude,p_longitude,nullif(btrim(p_country),''),nullif(btrim(p_region),''),nullif(btrim(p_city),''),p_source)
    returning id into v_id;
  end if;
  update public.profiles set last_login_at=now(), last_login_latitude=p_latitude, last_login_longitude=p_longitude where id=v_actor;
  return v_id;
end; $$;

revoke execute on function public.record_location_history(uuid,double precision,double precision,text,text,text,text) from public,anon;

grant execute on function public.record_location_history(uuid,double precision,double precision,text,text,text,text) to authenticated;

create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid; v_type public.notification_type; v_title text; v_body text; v_space uuid; v_actor uuid;
begin
  v_actor := coalesce((to_jsonb(new)->>'creator_id')::uuid, (to_jsonb(new)->>'author_id')::uuid);
  v_space := (to_jsonb(new)->>'space_id')::uuid;
  select member.user_id into v_recipient from public.space_members member
  where member.space_id=v_space and member.status='active' and member.user_id<>v_actor limit 1;
  if v_recipient is null then return new; end if;
  if tg_table_name='memory_entries' then v_type='memory_created'; v_title='新增回忆'; v_body='对方新增了一条回忆';
  elsif tg_table_name='mood_entries' then v_type='mood_created'; v_title='更新心情'; v_body='对方更新了心情';
  else v_type='calendar_event'; v_title='新增日历事件'; v_body='对方新增了日历事件'; end if;
  insert into public.notifications(recipient_id,type,source_id,title,body) values(v_recipient,v_type,new.id,v_title,v_body);
  return new;
end; $$;

drop trigger if exists memory_partner_activity on public.memory_entries;

create trigger memory_partner_activity after insert on public.memory_entries for each row execute function public.notify_partner_activity();

drop trigger if exists mood_partner_activity on public.mood_entries;

create trigger mood_partner_activity after insert on public.mood_entries for each row execute function public.notify_partner_activity();

drop trigger if exists calendar_partner_activity on public.calendar_events;

create trigger calendar_partner_activity after insert on public.calendar_events for each row execute function public.notify_partner_activity();


-- ============================================================================
-- Source history: 202607260002_home_v7_rules.sql
-- ============================================================================

alter table public.notifications add column if not exists actor_id uuid references public.profiles(id) on delete restrict;

create index if not exists notifications_recipient_recent_idx on public.notifications(recipient_id, created_at desc);

alter table public.mood_entries add column if not exists source text not null default 'manual' check (source in ('manual','daily_quote'));

create or replace function public.create_home_mood(p_space_id uuid,p_body text,p_source text default 'manual') returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_today date:=(now() at time zone 'Asia/Shanghai')::date;v_last timestamptz;v_count integer;
begin
 if v_actor is null or not public.is_active_space_member(p_space_id,v_actor) then raise exception 'mood access denied' using errcode='42501'; end if;
 if p_source not in ('manual','daily_quote') or char_length(btrim(coalesce(p_body,''))) not between 1 and 280 then raise exception 'invalid mood entry' using errcode='22023'; end if;
 if p_source='manual' and char_length(btrim(p_body))>15 then raise exception 'manual mood too long' using errcode='22023'; end if;
 select count(*),max(created_at) into v_count,v_last from public.mood_entries where space_id=p_space_id and author_id=v_actor and (created_at at time zone 'Asia/Shanghai')::date=v_today;
 if v_count>=10 then raise exception 'daily mood limit'; end if;
 if v_last is not null and v_last>now()-interval '1 minute' then raise exception 'one minute interval'; end if;
 if p_source='daily_quote' and exists(select 1 from public.mood_entries where space_id=p_space_id and author_id=v_actor and source='daily_quote' and body=btrim(p_body) and (created_at at time zone 'Asia/Shanghai')::date=v_today) then raise exception 'daily quote already shared'; end if;
 insert into public.mood_entries(space_id,author_id,body,emoji,source) values(p_space_id,v_actor,btrim(p_body),'',p_source) returning id into v_id;
 return v_id;
end;$$;

revoke execute on function public.create_home_mood(uuid,text,text) from public,anon;

grant execute on function public.create_home_mood(uuid,text,text) to authenticated;

create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid;v_type public.notification_type;v_title text;v_body text;v_space uuid;v_actor uuid;
begin
 v_actor:=coalesce((to_jsonb(new)->>'creator_id')::uuid,(to_jsonb(new)->>'author_id')::uuid);
 v_space:=(to_jsonb(new)->>'space_id')::uuid;
 select member.user_id into v_recipient from public.space_members member where member.space_id=v_space and member.active and member.user_id<>v_actor limit 1;
 if v_recipient is null then return new; end if;
 if tg_table_name='memory_entries' then v_type='memory_created';v_title='新增回忆';v_body='对方新增了一条回忆';
 elsif tg_table_name='mood_entries' then v_type='mood_created';v_title='更新心情';v_body='对方更新了心情';
 else v_type='calendar_event';v_title='新增日历事件';v_body='对方新增了日历事件';end if;
 insert into public.notifications(recipient_id,actor_id,type,source_id,title,body) values(v_recipient,v_actor,v_type,new.id,v_title,v_body);
 return new;
end;$$;

drop trigger if exists memory_partner_activity on public.memory_entries;

create trigger memory_partner_activity after insert on public.memory_entries for each row execute function public.notify_partner_activity();

drop trigger if exists mood_partner_activity on public.mood_entries;

create trigger mood_partner_activity after insert on public.mood_entries for each row execute function public.notify_partner_activity();

drop trigger if exists calendar_partner_activity on public.calendar_events;

create trigger calendar_partner_activity after insert on public.calendar_events for each row execute function public.notify_partner_activity();

create or replace function public.notify_partner_journal() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid;
begin
 if new.entry_type<>'today' then return new; end if;
 select m.user_id into v_recipient from public.space_members m where m.space_id=new.space_id and m.active and m.user_id<>new.author_id limit 1;
 if v_recipient is not null then insert into public.notifications(recipient_id,actor_id,type,source_id,title,body) values(v_recipient,new.author_id,'journal_created',new.id,'对方寄来一封信','对方寄来一封信'); end if;
 return new;
end;$$;

drop trigger if exists journal_partner_activity on public.journal_entries;

create trigger journal_partner_activity after insert on public.journal_entries for each row execute function public.notify_partner_journal();

create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid();v_space uuid;v_recipient uuid;v_body text;
begin
 v_space:=public.resolve_single_active_space(v_actor); if v_space is null then return; end if;
 select m.user_id into v_recipient from public.space_members m where m.space_id=v_space and m.active and m.user_id<>v_actor limit 1;
 if v_recipient is null then return; end if;
 v_body:=case p_kind when 'avatar' then '对方更换了头像' when 'name' then '对方更换了昵称' else '对方更新了资料' end;
 insert into public.notifications(recipient_id,actor_id,type,source_id,title,body) values(v_recipient,v_actor,'profile_updated',v_actor,'资料更新',v_body);
end;$$;

revoke execute on function public.notify_partner_profile_change(text) from public,anon;

grant execute on function public.notify_partner_profile_change(text) to authenticated;


-- ============================================================================
-- Source history: 202607260003_notification_actor_hotfix.sql
-- ============================================================================

alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete restrict;

create index if not exists notifications_recipient_recent_idx
  on public.notifications(recipient_id, created_at desc);


-- ============================================================================
-- Source history: 202607260004_notification_enum_compat.sql
-- ============================================================================

alter type public.notification_type add value if not exists 'memory_created';

alter type public.notification_type add value if not exists 'mood_created';

alter type public.notification_type add value if not exists 'profile_updated';

alter type public.notification_type add value if not exists 'journal_created';


-- ============================================================================
-- Source history: 202607260007_memory_tree_rules.sql
-- ============================================================================

alter table public.memory_entries
  drop constraint if exists memory_entries_title_check;

alter table public.memory_entries
  add constraint memory_entries_title_check check (char_length(title) between 1 and 30);

alter table public.memory_entries
  drop constraint if exists memory_entries_body_check;

alter table public.memory_entries
  add constraint memory_entries_body_check check (char_length(body) between 1 and 150);

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

  insert into public.memory_entries(id, space_id, author_id, title, body, occurred_on, image_path)
  values (p_id, p_space_id, v_actor, v_title, v_body, p_occurred_on, p_image_path);
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
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 30
     or char_length(btrim(coalesce(p_body, ''))) not between 1 and 150
     or p_occurred_on is null then
    raise exception 'invalid memory entry' using errcode = '22023';
  end if;

  update public.memory_entries as memory
  set title = btrim(p_title), body = btrim(p_body), occurred_on = p_occurred_on, updated_at = now()
  where memory.id = p_id
    and memory.author_id = v_actor
    and memory.created_at > now() - interval '24 hours'
    and public.is_active_space_member(memory.space_id, v_actor);

  if not found then
    raise exception 'memory edit window closed' using errcode = '42501';
  end if;
end;
$$;


-- ============================================================================
-- Source history: 202607260008_memory_tree_v2.sql
-- ============================================================================

alter table public.memory_entries
  add column if not exists author_name_snapshot text,
  add column if not exists author_avatar_snapshot text;

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


-- ============================================================================
-- Source history: 202607260009_journal_letter_v1.sql
-- ============================================================================

alter table public.journal_entries drop constraint if exists journal_entries_check;

alter table public.journal_entries add constraint journal_entries_shape_check check (
  (
    entry_type = 'today' and locked_at is not null and sealed_at is null and open_at is null
    and (
      (recipient_id is null and entry_date is not null and opened_at is null and opened_by is null)
      or
      (recipient_id is not null and recipient_id <> author_id and entry_date is not null)
    )
  )
  or
  (
    entry_type = 'future' and recipient_id is not null and recipient_id <> author_id
    and entry_date is null and locked_at is not null and sealed_at is not null and open_at is not null
    and (opened_at is null) = (opened_by is null)
  )
) not valid;

drop index if exists public.one_today_diary_per_author_date;

create unique index one_today_diary_per_author_date
on public.journal_entries(space_id,author_id,entry_date)
where entry_type='today' and recipient_id is null;

alter table public.journal_entries
  add column if not exists rich_content jsonb,
  add column if not exists plain_text text,
  add column if not exists excerpt text,
  add column if not exists stationery_theme text not null default 'cream',
  add column if not exists withdrawn_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_at timestamptz;

alter table public.journal_entries drop constraint if exists journal_entries_title_check;

alter table public.journal_entries drop constraint if exists journal_entries_content_check;

alter table public.journal_entries add constraint journal_entries_titleless_check
  check (title = '') not valid;

alter table public.journal_entries add constraint journal_entries_plain_text_limit_check
  check (plain_text is null or char_length(normalize(btrim(plain_text), NFC)) between 1 and 5000) not valid;

alter table public.journal_entries add constraint journal_entries_stationery_theme_check
  check (stationery_theme in ('cream','rose','moon','vintage','sakura','lined')) not valid;

create or replace function public.create_letter_diary(
  p_space_id uuid,
  p_recipient_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if v_actor is null
    or not public.is_active_space_member(p_space_id, v_actor)
    or p_recipient_id = v_actor
    or not public.is_active_space_member(p_space_id, p_recipient_id)
  then raise exception 'letter access denied' using errcode = '42501'; end if;
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
  then raise exception 'invalid letter' using errcode = '22023'; end if;

  insert into public.journal_entries(
    space_id, author_id, recipient_id, entry_type, title, content,
    rich_content, plain_text, excerpt, stationery_theme,
    entry_date, created_local_date, published_at, locked_at
  ) values (
    p_space_id, v_actor, p_recipient_id, 'today', '', v_text,
    p_rich_content, v_text, left(v_text, 88), p_stationery_theme,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    clock_timestamp(), clock_timestamp() + interval '24 hours'
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_letter_diary(
  p_entry_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
  then raise exception 'invalid letter' using errcode = '22023'; end if;
  update public.journal_entries
  set content=v_text, rich_content=p_rich_content, plain_text=v_text,
      excerpt=left(v_text,88), stationery_theme=p_stationery_theme, updated_at=clock_timestamp()
  where id=p_entry_id and author_id=auth.uid() and deleted_at is null
    and withdrawn_at is null and clock_timestamp() <= locked_at;
  if not found then raise exception 'letter edit window closed' using errcode='42501'; end if;
end;
$$;

revoke execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text) from public,anon;

revoke execute on function public.update_letter_diary(uuid,jsonb,text,text) from public,anon;

grant execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text) to authenticated;

grant execute on function public.update_letter_diary(uuid,jsonb,text,text) to authenticated;

alter table public.journal_comments
  add column if not exists withdrawn_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.journal_comments drop constraint if exists journal_comments_body_check;

alter table public.journal_comments add constraint journal_comments_body_200_check
  check (char_length(normalize(btrim(body), NFC)) between 1 and 200) not valid;

create or replace function public.update_journal_comment(p_actor_id uuid,p_comment_id uuid,p_body text)
returns public.journal_comments language plpgsql security definer set search_path='' as $$
declare v_comment public.journal_comments;
begin
  if p_actor_id is distinct from auth.uid() or char_length(normalize(btrim(coalesce(p_body,'')),NFC)) not between 1 and 200
  then raise exception 'invalid comment' using errcode='22023'; end if;
  update public.journal_comments set body=btrim(p_body)
  where id=p_comment_id and author_id=p_actor_id and deleted_at is null and withdrawn_at is null
    and clock_timestamp() <= created_at + interval '24 hours'
  returning * into v_comment;
  if not found then raise exception 'comment not found or immutable' using errcode='P0002'; end if;
  return v_comment;
end; $$;

create or replace function public.delete_journal_comment(p_comment_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  update public.journal_comments set deleted_at=clock_timestamp()
  where id=p_comment_id and author_id=auth.uid() and deleted_at is null
    and clock_timestamp() <= created_at + interval '24 hours';
  if not found then raise exception 'comment not found or immutable' using errcode='P0002'; end if;
  return p_comment_id;
end; $$;

drop policy if exists "active members can read visible journal entries" on public.journal_entries;

create policy "active members can read visible journal entries"
on public.journal_entries for select to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    (author_id = auth.uid())
    or (
      recipient_id = auth.uid()
      and deleted_at is null
      and withdrawn_at is null
      and (
        entry_type = 'today'
        or (entry_type = 'future' and opened_at is not null)
      )
    )
  )
);

drop policy if exists "members can read eligible journal comments" on public.journal_comments;

create policy "members can read eligible journal comments"
on public.journal_comments for select to authenticated
using (
  deleted_at is null
  and public.can_interact_with_journal(entry_id)
  and exists (
    select 1 from public.journal_entries as journal
    where journal.id = journal_comments.entry_id
      and journal.space_id = journal_comments.space_id
      and journal.deleted_at is null
      and journal.withdrawn_at is null
  )
);


-- ============================================================================
-- Source history: 202607260010_journal_letter_mood_star.sql
-- ============================================================================

alter table public.journal_entries
  add column if not exists mood_emoji text,
  add column if not exists star_at timestamptz;

create index if not exists journal_entries_starred_idx
on public.journal_entries(author_id, star_at desc)
where star_at is not null and deleted_at is null;

create or replace function public.create_letter_diary(
  p_space_id uuid,
  p_recipient_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if v_actor is null
    or not public.is_active_space_member(p_space_id, v_actor)
    or p_recipient_id = v_actor
    or not public.is_active_space_member(p_space_id, p_recipient_id)
  then raise exception 'letter access denied' using errcode = '42501'; end if;
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
    or (p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭'))
  then raise exception 'invalid letter' using errcode = '22023'; end if;

  insert into public.journal_entries(
    space_id, author_id, recipient_id, entry_type, title, content,
    rich_content, plain_text, excerpt, stationery_theme, mood_emoji,
    entry_date, created_local_date, published_at, locked_at
  ) values (
    p_space_id, v_actor, p_recipient_id, 'today', '', v_text,
    p_rich_content, v_text, left(v_text, 88), p_stationery_theme, p_mood_emoji,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    clock_timestamp(), clock_timestamp() + interval '24 hours'
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_letter_diary(
  p_entry_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
    or (p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭'))
  then raise exception 'invalid letter' using errcode = '22023'; end if;
  update public.journal_entries
  set content=v_text, rich_content=p_rich_content, plain_text=v_text,
      excerpt=left(v_text,88), stationery_theme=p_stationery_theme, 
      mood_emoji=p_mood_emoji, updated_at=clock_timestamp()
  where id=p_entry_id and author_id=auth.uid() and deleted_at is null
    and withdrawn_at is null and clock_timestamp() <= locked_at;
  if not found then raise exception 'letter edit window closed' using errcode='42501'; end if;
end;
$$;

create or replace function public.toggle_letter_star(p_entry_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_current timestamptz;
begin
  select star_at into v_current from public.journal_entries
  where id=p_entry_id and (author_id=auth.uid() or recipient_id=auth.uid())
    and deleted_at is null;
  if not found then raise exception 'letter not found' using errcode='P0002'; end if;
  update public.journal_entries
  set star_at=case when v_current is null then clock_timestamp() else null end
  where id=p_entry_id;
  return v_current is null;
end; $$;

revoke execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text) from authenticated;

revoke execute on function public.update_letter_diary(uuid,jsonb,text,text) from authenticated;

grant execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text,text) to authenticated;

grant execute on function public.update_letter_diary(uuid,jsonb,text,text,text) to authenticated;

grant execute on function public.toggle_letter_star(uuid) to authenticated;


-- ============================================================================
-- Source history: 202607270001_fix_journal_rls.sql
-- ============================================================================

drop policy if exists "active members can read visible journal entries" on public.journal_entries;

create policy "active members can read visible journal entries"
on public.journal_entries for select to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    (author_id = auth.uid())
    or (
      recipient_id = auth.uid()
      and deleted_at is null
      and withdrawn_at is null
      and (
        entry_type = 'today'
        or (entry_type = 'future' and opened_at is not null)
      )
    )
  )
);

alter table public.journal_entries
  add column if not exists mood_emoji text,
  add column if not exists star_at timestamptz;

alter table public.journal_entries add constraint journal_entries_mood_emoji_check
  check (mood_emoji is null or mood_emoji in ('😊','💕','🥺','😤','😴','🤔','😌','😭')) not valid;

create index if not exists journal_entries_starred_idx
on public.journal_entries(author_id, star_at desc)
where star_at is not null and deleted_at is null;

create or replace function public.create_letter_diary(
  p_space_id uuid,
  p_recipient_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if v_actor is null
    or not public.is_active_space_member(p_space_id, v_actor)
    or p_recipient_id = v_actor
    or not public.is_active_space_member(p_space_id, p_recipient_id)
  then raise exception 'letter access denied' using errcode = '42501'; end if;
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
    or (p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭'))
  then raise exception 'invalid letter' using errcode = '22023'; end if;

  insert into public.journal_entries(
    space_id, author_id, recipient_id, entry_type, title, content,
    rich_content, plain_text, excerpt, stationery_theme, mood_emoji,
    entry_date, created_local_date, published_at, locked_at
  ) values (
    p_space_id, v_actor, p_recipient_id, 'today', '', v_text,
    p_rich_content, v_text, left(v_text, 88), p_stationery_theme, p_mood_emoji,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    clock_timestamp(), clock_timestamp() + interval '24 hours'
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_letter_diary(
  p_entry_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
    or (p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭'))
  then raise exception 'invalid letter' using errcode = '22023'; end if;
  update public.journal_entries
  set content=v_text, rich_content=p_rich_content, plain_text=v_text,
      excerpt=left(v_text,88), stationery_theme=p_stationery_theme, 
      mood_emoji=p_mood_emoji, updated_at=clock_timestamp()
  where id=p_entry_id and author_id=auth.uid() and deleted_at is null
    and withdrawn_at is null and clock_timestamp() <= locked_at;
  if not found then raise exception 'letter edit window closed' using errcode='42501'; end if;
end;
$$;

create or replace function public.toggle_letter_star(p_entry_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_current timestamptz;
begin
  select star_at into v_current from public.journal_entries
  where id=p_entry_id and (author_id=auth.uid() or recipient_id=auth.uid())
    and deleted_at is null;
  if not found then raise exception 'letter not found' using errcode='P0002'; end if;
  update public.journal_entries
  set star_at=case when v_current is null then clock_timestamp() else null end
  where id=p_entry_id;
  return v_current is null;
end; $$;

revoke execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text) from authenticated;

revoke execute on function public.update_letter_diary(uuid,jsonb,text,text) from authenticated;

grant execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text,text) to authenticated;

grant execute on function public.update_letter_diary(uuid,jsonb,text,text,text) to authenticated;

grant execute on function public.toggle_letter_star(uuid) to authenticated;


-- ============================================================================
-- Source history: 202607270002_journal_drafts.sql
-- ============================================================================

create table if not exists public.journal_drafts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete restrict,
  rich_text_json jsonb,
  plain_text text,
  mood_emoji text,
  stationery_theme text not null default 'cream',
  salutation text,
  character_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists journal_drafts_author_id_unique_idx
on public.journal_drafts(author_id);

create index if not exists journal_drafts_space_id_idx
on public.journal_drafts(space_id);

alter table public.journal_drafts enable row level security;

create policy "authors can read their own drafts"
on public.journal_drafts for select to authenticated
using (author_id = auth.uid());

create policy "authors can update their own drafts"
on public.journal_drafts for update to authenticated
using (author_id = auth.uid());

create policy "authors can delete their own drafts"
on public.journal_drafts for delete to authenticated
using (author_id = auth.uid());

create trigger journal_drafts_set_updated_at
before update on public.journal_drafts
for each row execute function public.set_updated_at();

create or replace function public.upsert_journal_draft(
  p_space_id uuid,
  p_author_id uuid,
  p_recipient_id uuid,
  p_rich_text_json jsonb,
  p_plain_text text,
  p_mood_emoji text,
  p_stationery_theme text,
  p_salutation text,
  p_character_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Validate stationery theme
  if p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined') then
    raise exception 'invalid stationery theme' using errcode = '22023';
  end if;
  
  -- Validate mood emoji
  if p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭') then
    raise exception 'invalid mood emoji' using errcode = '22023';
  end if;
  
  -- Upsert: update existing or insert new
  update public.journal_drafts
  set
    recipient_id = p_recipient_id,
    rich_text_json = p_rich_text_json,
    plain_text = p_plain_text,
    mood_emoji = p_mood_emoji,
    stationery_theme = p_stationery_theme,
    salutation = p_salutation,
    character_count = p_character_count,
    updated_at = clock_timestamp()
  where author_id = p_author_id;
  
  if not found then
    insert into public.journal_drafts (
      space_id,
      author_id,
      recipient_id,
      rich_text_json,
      plain_text,
      mood_emoji,
      stationery_theme,
      salutation,
      character_count
    ) values (
      p_space_id,
      p_author_id,
      p_recipient_id,
      p_rich_text_json,
      p_plain_text,
      p_mood_emoji,
      p_stationery_theme,
      p_salutation,
      p_character_count
    );
  end if;
end;
$$;

create or replace function public.delete_journal_draft(p_author_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.journal_drafts
  where author_id = p_author_id;
end;
$$;

revoke execute on function public.upsert_journal_draft(uuid,uuid,uuid,jsonb,text,text,text,text,integer) from public, anon;

revoke execute on function public.delete_journal_draft(uuid) from public, anon;

grant execute on function public.upsert_journal_draft(uuid,uuid,uuid,jsonb,text,text,text,text,integer) to authenticated;

grant execute on function public.delete_journal_draft(uuid) to authenticated;

grant select on public.journal_drafts to authenticated;


-- ============================================================================
-- Source history: 202607270003_drafts_and_comments_hardening.sql
-- ============================================================================

create or replace function public.upsert_journal_draft(
  p_space_id uuid,
  p_author_id uuid,
  p_recipient_id uuid,
  p_rich_text_json jsonb,
  p_plain_text text,
  p_mood_emoji text,
  p_stationery_theme text,
  p_salutation text,
  p_character_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Strict author validation: caller must be the author
  if v_actor is null or v_actor <> p_author_id then
    raise exception 'draft access denied' using errcode = '42501';
  end if;

  -- Validate space membership
  if not public.is_active_space_member(p_space_id, v_actor)
     or not public.is_active_space_member(p_space_id, p_recipient_id) then
    raise exception 'draft access denied' using errcode = '42501';
  end if;

  -- Validate stationery theme
  if p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined') then
    raise exception 'invalid stationery theme' using errcode = '22023';
  end if;
  
  -- Validate mood emoji
  if p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭') then
    raise exception 'invalid mood emoji' using errcode = '22023';
  end if;
  
  -- Upsert: update existing or insert new
  update public.journal_drafts
  set
    recipient_id = p_recipient_id,
    rich_text_json = p_rich_text_json,
    plain_text = p_plain_text,
    mood_emoji = p_mood_emoji,
    stationery_theme = p_stationery_theme,
    salutation = p_salutation,
    character_count = p_character_count,
    updated_at = clock_timestamp()
  where author_id = p_author_id;
  
  if not found then
    insert into public.journal_drafts (
      space_id,
      author_id,
      recipient_id,
      rich_text_json,
      plain_text,
      mood_emoji,
      stationery_theme,
      salutation,
      character_count
    ) values (
      p_space_id,
      p_author_id,
      p_recipient_id,
      p_rich_text_json,
      p_plain_text,
      p_mood_emoji,
      p_stationery_theme,
      p_salutation,
      p_character_count
    );
  end if;
end;
$$;

create or replace function public.delete_journal_draft(p_author_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or v_actor <> p_author_id then
    raise exception 'draft access denied' using errcode = '42501';
  end if;
  delete from public.journal_drafts
  where author_id = p_author_id;
end;
$$;

revoke execute on function public.upsert_journal_draft(uuid,uuid,uuid,jsonb,text,text,text,text,integer) from public, anon;

revoke execute on function public.delete_journal_draft(uuid) from public, anon;

grant execute on function public.upsert_journal_draft(uuid,uuid,uuid,jsonb,text,text,text,text,integer) to authenticated;

grant execute on function public.delete_journal_draft(uuid) to authenticated;

alter table public.journal_comments
  add column if not exists parent_id uuid references public.journal_comments(id) on delete cascade,
  add column if not exists editable_until timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists journal_comments_parent_id_idx
on public.journal_comments(parent_id)
where parent_id is not null and deleted_at is null;

create index if not exists journal_comments_entry_active_idx
on public.journal_comments(entry_id, created_at desc)
where deleted_at is null;

create or replace function public.journal_comments_set_editable_until()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.editable_until := new.created_at + interval '24 hours';
  return new;
end;
$$;

drop trigger if exists journal_comments_set_editable_until_trg on public.journal_comments;

create trigger journal_comments_set_editable_until_trg
before insert on public.journal_comments
for each row execute function public.journal_comments_set_editable_until();

create or replace function public.create_journal_comment_v2(
  p_entry_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns public.journal_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space_id uuid;
  v_comment public.journal_comments;
  v_parent_depth integer := 0;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Validate entry access
  select journal.space_id into v_space_id
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and public.is_active_space_member(journal.space_id, v_actor)
    and (
      journal.author_id = v_actor
      or (
        journal.recipient_id = v_actor
        and journal.deleted_at is null
        and journal.withdrawn_at is null
        and (
          journal.entry_type = 'today'
          or (journal.entry_type = 'future' and journal.opened_at is not null)
        )
      )
    );

  if not found then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  -- Validate body length (200 chars max for comments/replies)
  if char_length(normalize(btrim(coalesce(p_body, '')), NFC)) not between 1 and 200 then
    raise exception 'invalid comment body (1-200 chars)' using errcode = '22023';
  end if;

  -- If replying, validate parent exists and is top-level (no nested replies)
  if p_parent_id is not null then
    select case when parent.parent_id is null then 0 else 1 end into v_parent_depth
    from public.journal_comments as parent
    where parent.id = p_parent_id
      and parent.entry_id = p_entry_id
      and parent.deleted_at is null;

    if not found then
      raise exception 'parent comment not found' using errcode = 'P0002';
    end if;

    -- Only allow one level of replies
    if v_parent_depth > 0 then
      raise exception 'cannot reply to a reply' using errcode = '22023';
    end if;
  end if;

  insert into public.journal_comments(
    space_id, entry_id, author_id, parent_id, body
  ) values (
    v_space_id, p_entry_id, v_actor, p_parent_id, btrim(p_body)
  )
  returning * into v_comment;

  return v_comment;
end;
$$;

create or replace function public.update_journal_comment_v2(
  p_comment_id uuid,
  p_body text
)
returns public.journal_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_comment public.journal_comments;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if char_length(normalize(btrim(coalesce(p_body, '')), NFC)) not between 1 and 200 then
    raise exception 'invalid comment body (1-200 chars)' using errcode = '22023';
  end if;

  update public.journal_comments
  set body = btrim(p_body),
      updated_at = clock_timestamp()
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and withdrawn_at is null
    and clock_timestamp() <= editable_until
  returning * into v_comment;

  if not found then
    raise exception 'comment not found or edit window closed' using errcode = '42501';
  end if;

  return v_comment;
end;
$$;

create or replace function public.withdraw_journal_comment(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.journal_comments
  set withdrawn_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and withdrawn_at is null
    and clock_timestamp() <= editable_until;

  if not found then
    raise exception 'comment not found or edit window closed' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_journal_comment_v2(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.journal_comments
  set deleted_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and clock_timestamp() <= editable_until;

  if not found then
    raise exception 'comment not found or edit window closed' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.create_journal_comment_v2(uuid,text,uuid) to authenticated;

grant execute on function public.update_journal_comment_v2(uuid,text) to authenticated;

grant execute on function public.withdraw_journal_comment(uuid) to authenticated;

grant execute on function public.delete_journal_comment_v2(uuid) to authenticated;

drop policy if exists "members can read eligible journal comments" on public.journal_comments;

create policy "members can read eligible journal comments"
on public.journal_comments for select to authenticated
using (
  public.can_interact_with_journal(entry_id)
  and deleted_at is null
  and exists (
    select 1 from public.journal_entries as journal
    where journal.id = journal_comments.entry_id
      and journal.space_id = journal_comments.space_id
  )
);

create or replace function public.get_journal_comment_count(p_entry_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.journal_comments
  where entry_id = p_entry_id
    and deleted_at is null;
$$;

grant execute on function public.get_journal_comment_count(uuid) to authenticated;


-- ============================================================================
-- Source history: 202607270004_capsule_letter_limit.sql
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'journal_entry_status') then
    create type public.journal_entry_status as enum ('draft', 'scheduled', 'sent', 'cancelled');
  end if;
end $$;

alter table public.journal_entries
  add column if not exists status public.journal_entry_status default 'draft',
  add column if not exists scheduled_created_at timestamptz,
  add column if not exists cancelled_at timestamptz;

create or replace function public.get_capsule_letter_limit_status()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_count integer;
  v_limit integer := 1;
  v_reset_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 统计今日已封存的胶囊信数量
  select count(*) into v_count
  from public.journal_entries
  where author_id = v_user_id
    and entry_type = 'future'
    and status in ('scheduled', 'sent', 'cancelled')
    and (scheduled_created_at at time zone 'Asia/Shanghai')::date = v_local_date;

  -- 计算恢复时间（第二天00:00上海时间）
  v_reset_at := (v_local_date + interval '1 day')::timestamptz at time zone 'Asia/Shanghai';

  return json_build_object(
    'used_today', v_count,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_count, 0),
    'is_limit_reached', v_count >= v_limit,
    'reset_at', v_reset_at
  );
end;
$$;

create or replace function public.get_normal_letter_limit_status()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_count integer;
  v_limit integer := 999; -- 普通信无每日限制
  v_reset_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 统计今日已发布的普通信数量（仅供统计，不限额度）
  select count(*) into v_count
  from public.journal_entries
  where author_id = v_user_id
    and entry_type = 'today'
    and status = 'sent'
    and (created_local_date) = v_local_date;

  -- 计算恢复时间（第二天00:00上海时间）
  v_reset_at := (v_local_date + interval '1 day')::timestamptz at time zone 'Asia/Shanghai';

  return json_build_object(
    'used_today', v_count,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_count, 0),
    'is_limit_reached', false, -- 普通信永远不会达到额度限制
    'reset_at', v_reset_at
  );
end;
$$;

create or replace function public.seal_future_diary(
  p_space_id uuid,
  p_title text,
  p_content text,
  p_recipient_id uuid,
  p_open_at timestamptz,
  p_image_path text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_entry public.journal_entries;
  v_capsule_count integer;
begin
  if v_user_id is null or not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'active space membership required' using errcode = '42501';
  end if;
  if p_recipient_id = v_user_id or not exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = p_recipient_id
      and active
  ) then
    raise exception 'recipient must be the other active member' using errcode = '22023';
  end if;
  if p_open_at <= v_now then
    raise exception 'open time must be in the future' using errcode = '22007';
  end if;

  -- 检查胶囊信每日额度
  select count(*) into v_capsule_count
  from public.journal_entries
  where author_id = v_user_id
    and entry_type = 'future'
    and status in ('scheduled', 'sent', 'cancelled')
    and (scheduled_created_at at time zone 'Asia/Shanghai')::date = v_local_date;

  if v_capsule_count >= 1 then
    raise exception 'DAILY_CAPSULE_LETTER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into public.journal_entries (
    space_id, author_id, recipient_id, entry_type, title, content, image_path,
    created_local_date, published_at, locked_at, sealed_at, open_at,
    status, scheduled_created_at
  ) values (
    p_space_id, v_user_id, p_recipient_id, 'future', btrim(p_title), btrim(p_content),
    p_image_path, v_local_date, v_now, v_now, v_now, p_open_at,
    'scheduled', v_now
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.update_future_diary(
  p_entry_id uuid,
  p_title text,
  p_content text,
  p_open_at timestamptz,
  p_image_path text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_author_id uuid;
  v_status public.journal_entry_status;
  v_entry public.journal_entries;
begin
  select journal.space_id, journal.author_id, journal.status
  into v_space_id, v_author_id, v_status
  from public.journal_entries as journal
  where id = p_entry_id
    and entry_type = 'future'
  for update;

  if not found
    or v_author_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;

  -- 只允许编辑状态为 scheduled 的胶囊信
  if v_status <> 'scheduled' then
    raise exception 'journal entry cannot be modified' using errcode = '55000';
  end if;

  update public.journal_entries
  set title = btrim(p_title),
      content = btrim(p_content),
      image_path = p_image_path,
      open_at = p_open_at,
      updated_at = now()
      -- scheduled_created_at 不更新，保持首次封存时间用于额度统计
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.cancel_future_diary(p_entry_id uuid)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_author_id uuid;
  v_status public.journal_entry_status;
  v_entry public.journal_entries;
begin
  select journal.space_id, journal.author_id, journal.status
  into v_space_id, v_author_id, v_status
  from public.journal_entries as journal
  where id = p_entry_id
    and entry_type = 'future'
  for update;

  if not found
    or v_author_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;

  -- 只允许取消状态为 scheduled 的胶囊信
  if v_status <> 'scheduled' then
    raise exception 'journal entry cannot be cancelled' using errcode = '55000';
  end if;

  update public.journal_entries
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.send_scheduled_future_diaries()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_entry record;
begin
  -- 查找所有到期但尚未发送的胶囊信
  for v_entry in select id, space_id, author_id, recipient_id, title, content
    from public.journal_entries
    where entry_type = 'future'
      and status = 'scheduled'
      and open_at <= v_now
      and cancelled_at is null
  loop
    begin
      -- 将状态改为 sent
      update public.journal_entries
      set status = 'sent',
          published_at = v_now,
          updated_at = v_now
      where id = v_entry.id;
      
      -- 创建新信通知给收件人
      insert into public.notifications(
        recipient_id, type, source_id, title, body
      )
      values (
        v_entry.recipient_id,
        'letter_created'::text::public.notification_type,
        v_entry.id,
        '收到一封新的胶囊信',
        '时间胶囊已经送达，快来看看吧。'
      )
      on conflict (recipient_id, type, source_id)
      do nothing;
      
    exception
      when others then
        -- 记录错误但继续处理其他信件
        raise notice 'Failed to send future diary %: %', v_entry.id, SQLERRM;
    end;
  end loop;
end;
$$;

revoke execute on function public.get_capsule_letter_limit_status() from public, anon, authenticated;

revoke execute on function public.get_normal_letter_limit_status() from public, anon, authenticated;

revoke execute on function public.update_future_diary(uuid, text, text, timestamptz, text) from public, anon, authenticated;

revoke execute on function public.cancel_future_diary(uuid) from public, anon, authenticated;

revoke execute on function public.send_scheduled_future_diaries() from public, anon, authenticated;

grant execute on function public.get_capsule_letter_limit_status() to authenticated;

grant execute on function public.get_normal_letter_limit_status() to authenticated;

grant execute on function public.update_future_diary(uuid, text, text, timestamptz, text) to authenticated;

grant execute on function public.cancel_future_diary(uuid) to authenticated;

grant execute on function public.send_scheduled_future_diaries() to authenticated;


-- ============================================================================
-- Source history: 202607270005_fix_letter_classification.sql
-- ============================================================================

drop policy if exists "active members can read visible journal entries" on public.journal_entries;


-- ============================================================================
-- Source history: 202607270006_comment_notifications.sql
-- ============================================================================

begin;

alter table if exists public.notifications
add column if not exists related_entry_id uuid references public.journal_entries(id) on delete cascade;

alter type public.notification_type add value if not exists 'journal_comment_created';

alter type public.notification_type add value if not exists 'journal_reply_created';

create or replace function public.create_journal_comment_v2(
  p_entry_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns public.journal_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space_id uuid;
  v_comment public.journal_comments;
  v_parent_depth int;
  v_journal_author_id uuid;
  v_journal_recipient_id uuid;
  v_notification_recipient_id uuid;
  v_notification_title text;
  v_notification_body text;
  v_notification_type public.notification_type;
  v_actor_name text;
  v_parent_author_id uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Validate entry access and get author/recipient
  select journal.space_id, journal.author_id, journal.recipient_id
  into v_space_id, v_journal_author_id, v_journal_recipient_id
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and public.is_active_space_member(journal.space_id, v_actor)
    and (
      journal.author_id = v_actor
      or (
        journal.recipient_id = v_actor
        and journal.deleted_at is null
        and journal.withdrawn_at is null
        and (
          journal.entry_type = 'today'
          or (journal.entry_type = 'future' and journal.opened_at is not null)
        )
      )
    );

  if not found then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  -- Validate body length (200 chars max for comments/replies)
  if char_length(normalize(btrim(coalesce(p_body, '')), NFC)) not between 1 and 200 then
    raise exception 'invalid comment body (1-200 chars)' using errcode = '22023';
  end if;

  -- If replying, validate parent exists and is top-level (no nested replies)
  if p_parent_id is not null then
    select case when parent.parent_id is null then 0 else 1 end, parent.author_id
    into v_parent_depth, v_parent_author_id
    from public.journal_comments as parent
    where parent.id = p_parent_id
      and parent.entry_id = p_entry_id
      and parent.deleted_at is null;

    if not found then
      raise exception 'parent comment not found' using errcode = 'P0002';
    end if;

    -- Only allow one level of replies
    if v_parent_depth > 0 then
      raise exception 'cannot reply to a reply' using errcode = '22023';
    end if;
  end if;

  -- Insert comment
  insert into public.journal_comments(
    space_id, entry_id, author_id, parent_id, body
  ) values (
    v_space_id, p_entry_id, v_actor, p_parent_id, btrim(p_body)
  )
  returning * into v_comment;

  -- Create notification
  if p_parent_id is not null then
    -- Scenario B: Reply to a comment - notify the parent comment's author
    v_notification_recipient_id := v_parent_author_id;
    v_notification_type := 'journal_reply_created';
    v_notification_title := '回复了你的评论';
  else
    -- Scenario A: New comment on letter - notify the letter author
    v_notification_recipient_id := v_journal_author_id;
    v_notification_type := 'journal_comment_created';
    v_notification_title := '评论了你的信';
  end if;

  -- Don't notify self
  if v_notification_recipient_id <> v_actor then
    -- Get author display name
    select display_name into v_actor_name
    from public.profiles
    where id = v_actor;

    v_notification_title := v_actor_name || ' ' || v_notification_title;
    v_notification_body := left(btrim(p_body), 80);

    -- Insert notification with proper fields
    insert into public.notifications(
      recipient_id,
      actor_id,
      type,
      source_id,
      related_entry_id,
      title,
      body
    ) values (
      v_notification_recipient_id,
      v_actor,
      v_notification_type,
      v_comment.id,
      p_entry_id,
      v_notification_title,
      v_notification_body
    );
  end if;

  return v_comment;
end;
$$;

grant execute on function public.create_journal_comment_v2(uuid, text, uuid) to authenticated;

create or replace function public.withdraw_journal_comment(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_comment public.journal_comments;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Check if comment exists, is owned by actor, and is within 24 hours
  select * into v_comment
  from public.journal_comments
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and withdrawn_at is null
    and editable_until is not null
    and clock_timestamp() <= editable_until;

  if not found then
    raise exception 'comment not found or not editable' using errcode = 'P0002';
  end if;

  -- Withdraw the comment
  update public.journal_comments
  set withdrawn_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_comment_id;

  -- Delete corresponding unread notifications
  delete from public.notifications
  where source_id = p_comment_id
    and type in ('journal_comment_created', 'journal_reply_created')
    and is_read = false;
end;
$$;

grant execute on function public.withdraw_journal_comment(uuid) to authenticated;

create or replace function public.delete_journal_comment_v2(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_comment public.journal_comments;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Check if comment exists, is owned by actor, and is within 24 hours
  select * into v_comment
  from public.journal_comments
  where id = p_comment_id
    and author_id = v_actor
    and deleted_at is null
    and editable_until is not null
    and clock_timestamp() <= editable_until;

  if not found then
    raise exception 'comment not found or not editable' using errcode = 'P0002';
  end if;

  -- Delete the comment (soft delete)
  update public.journal_comments
  set deleted_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_comment_id;

  -- Delete corresponding unread notifications
  delete from public.notifications
  where source_id = p_comment_id
    and type in ('journal_comment_created', 'journal_reply_created')
    and is_read = false;
end;
$$;

grant execute on function public.delete_journal_comment_v2(uuid) to authenticated;

commit;


-- ============================================================================
-- Source history: 202607270006_fix_mood_notification_body.sql
-- ============================================================================

create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_space uuid;
  v_actor uuid;
begin
  v_actor := coalesce((to_jsonb(new)->>'creator_id')::uuid, (to_jsonb(new)->>'author_id')::uuid);
  v_space := (to_jsonb(new)->>'space_id')::uuid;
  
  select member.user_id into v_recipient 
  from public.space_members member 
  where member.space_id = v_space 
    and member.active 
    and member.user_id <> v_actor 
  limit 1;
  
  if v_recipient is null then return new; end if;
  
  if tg_table_name = 'memory_entries' then
    v_type := 'memory_created';
    v_title := '新增回忆';
    v_body := new.title;
  elsif tg_table_name = 'mood_entries' then
    v_type := 'mood_created';
    v_title := '更新了心情';
    v_body := coalesce(new.body, '');
    -- 如果有表情，添加到通知中
    if new.emoji is not null and btrim(new.emoji) <> '' then
      v_body := new.emoji || ' ' || v_body;
    end if;
  else
    v_type := 'calendar_event';
    v_title := '新增日历事件';
    v_body := new.name;
  end if;
  
  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
  values (v_recipient, v_actor, v_type, new.id, v_title, v_body);
  
  return new;
end;
$$;

drop trigger if exists memory_partner_activity on public.memory_entries;

create trigger memory_partner_activity
  after insert on public.memory_entries
  for each row
  execute function public.notify_partner_activity();

drop trigger if exists mood_partner_activity on public.mood_entries;

create trigger mood_partner_activity
  after insert on public.mood_entries
  for each row
  execute function public.notify_partner_activity();

drop trigger if exists calendar_partner_activity on public.calendar_events;

create trigger calendar_partner_activity
  after insert on public.calendar_events
  for each row
  execute function public.notify_partner_activity();


-- ============================================================================
-- Source history: 202607270007_couple_settings.sql
-- ============================================================================

begin;

alter table if exists public.profiles
add column if not exists partner_nickname text check (char_length(partner_nickname) between 1 and 12);

alter table if exists public.spaces
add column if not exists theme text not null default 'cream';

create type public.setting_request_type as enum ('space_name', 'relationship_started_on', 'theme');

create type public.setting_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table if not exists public.couple_setting_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  setting_type public.setting_request_type not null,
  current_value text not null,
  proposed_value text not null,
  status public.setting_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responder_id uuid references public.profiles(id) on delete cascade,
  cancelled_at timestamptz
);

create unique index if not exists couple_setting_requests_unique_pending
on public.couple_setting_requests(space_id, setting_type)
where status = 'pending';

alter type public.notification_type add value if not exists 'space_setting_request';

alter type public.notification_type add value if not exists 'space_setting_response';

alter table public.couple_setting_requests enable row level security;

create policy "active members can read setting requests in their space"
on public.couple_setting_requests for select to authenticated
using (public.is_active_space_member(space_id));

create policy "active members can create setting requests"
on public.couple_setting_requests for insert to authenticated
with check (public.is_active_space_member(space_id) and requester_id = auth.uid());

create policy "requester can cancel their own request"
on public.couple_setting_requests for update to authenticated
using (requester_id = auth.uid() and status = 'pending')
with check (requester_id = auth.uid());

create policy "responder can approve/reject"
on public.couple_setting_requests for update to authenticated
using (
  status = 'pending'
  and requester_id <> auth.uid()
  and public.is_active_space_member(space_id)
);

revoke all privileges on table public.couple_setting_requests from anon, authenticated;

grant select on public.couple_setting_requests to authenticated;

grant insert on public.couple_setting_requests to authenticated;

grant update (status, responded_at, responder_id, cancelled_at) on public.couple_setting_requests to authenticated;

grant update (partner_nickname) on public.profiles to authenticated;

grant update (theme) on public.spaces to authenticated;

commit;


-- ============================================================================
-- Source history: 202607270007_fix_draft_upsert_return_id.sql
-- ============================================================================

drop function if exists public.upsert_journal_draft(
  uuid,   -- p_space_id
  uuid,   -- p_author_id
  uuid,   -- p_recipient_id
  jsonb,  -- p_rich_text_json
  text,   -- p_plain_text
  text,   -- p_mood_emoji
  text,   -- p_stationery_theme
  text,   -- p_salutation
  integer -- p_character_count
);

create unique index if not exists journal_drafts_space_author_unique_idx
  on public.journal_drafts(space_id, author_id);

drop index if exists public.journal_drafts_author_id_unique_idx;

create function public.upsert_journal_draft(
  p_space_id uuid,
  p_author_id uuid,
  p_recipient_id uuid,
  p_rich_text_json jsonb,
  p_plain_text text,
  p_mood_emoji text,
  p_stationery_theme text,
  p_salutation text,
  p_character_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft_id uuid;
begin
  -- ========== 身份校验 ==========
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_author_id <> auth.uid() then
    raise exception 'author mismatch: p_author_id does not match authenticated user' using errcode = '42501';
  end if;

  -- ========== 参数校验 ==========
  if p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined') then
    raise exception 'invalid stationery theme' using errcode = '22023';
  end if;

  if p_mood_emoji is not null
     and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭') then
    raise exception 'invalid mood emoji' using errcode = '22023';
  end if;

  -- ========== 空间成员校验 ==========
  -- author 必须是该空间的活跃成员
  if not exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = p_author_id
      and active
  ) then
    raise exception 'author is not an active member of this space' using errcode = '42501';
  end if;

  -- recipient 必须是同一空间的另一位活跃成员
  if not exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = p_recipient_id
      and active
      and user_id <> p_author_id
  ) then
    raise exception 'recipient is not an active member of this space or is the same as author' using errcode = '42501';
  end if;

  -- ========== Upsert ==========
  -- 先尝试更新（在唯一约束 space_id + author_id 保证下最多命中一行）
  update public.journal_drafts
  set
    recipient_id      = p_recipient_id,
    rich_text_json    = p_rich_text_json,
    plain_text        = p_plain_text,
    mood_emoji        = p_mood_emoji,
    stationery_theme  = p_stationery_theme,
    salutation        = p_salutation,
    character_count   = p_character_count,
    updated_at        = clock_timestamp()
  where author_id = p_author_id
    and space_id = p_space_id
  returning id into v_draft_id;

  -- 若不存在则创建
  if v_draft_id is null then
    insert into public.journal_drafts (
      space_id,
      author_id,
      recipient_id,
      rich_text_json,
      plain_text,
      mood_emoji,
      stationery_theme,
      salutation,
      character_count
    ) values (
      p_space_id,
      p_author_id,
      p_recipient_id,
      p_rich_text_json,
      p_plain_text,
      p_mood_emoji,
      p_stationery_theme,
      p_salutation,
      p_character_count
    )
    returning id into v_draft_id;
  end if;

  return v_draft_id;
end;
$$;

revoke execute on function public.upsert_journal_draft(
  uuid,uuid,uuid,jsonb,text,text,text,text,integer
) from public, anon;

grant execute on function public.upsert_journal_draft(
  uuid,uuid,uuid,jsonb,text,text,text,text,integer
) to authenticated;


-- ============================================================================
-- Source history: 202607270008_couple_settings_functions.sql
-- ============================================================================

begin;

create or replace function public.create_couple_setting_request(
  p_setting_type public.setting_request_type,
  p_current_value text,
  p_proposed_value text
)
returns public.couple_setting_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space_id uuid;
  v_partner_id uuid;
  v_partner_name text;
  v_request public.couple_setting_requests;
  v_notification_title text;
  v_notification_body text;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Get space_id
  select space_id into v_space_id
  from public.space_members
  where user_id = v_actor and active;
  
  if not found then
    raise exception 'not a space member' using errcode = '42501';
  end if;

  -- Check for existing pending request
  if exists (
    select 1 from public.couple_setting_requests
    where space_id = v_space_id and setting_type = p_setting_type and status = 'pending'
  ) then
    raise exception 'pending request already exists' using errcode = '22000';
  end if;

  -- Insert request
  insert into public.couple_setting_requests(
    space_id, requester_id, setting_type, current_value, proposed_value
  ) values (
    v_space_id, v_actor, p_setting_type, p_current_value, p_proposed_value
  ) returning * into v_request;

  -- Get partner info for notification
  select user_id into v_partner_id
  from public.space_members
  where space_id = v_space_id and active and user_id <> v_actor;

  if v_partner_id is not null then
    select display_name into v_partner_name
    from public.profiles where id = v_actor;

    -- Build notification message based on setting type
    case p_setting_type
      when 'space_name' then
        v_notification_title := v_partner_name || ' 想修改你们的空间名称';
        v_notification_body := '想把空间名称改为「' || p_proposed_value || '」';
      when 'relationship_started_on' then
        v_notification_title := v_partner_name || ' 想重新确认你们开始的日期';
        v_notification_body := '想把开始日期改为 ' || p_proposed_value;
      when 'theme' then
        v_notification_title := v_partner_name || ' 想把小世界换上新皮肤';
        v_notification_body := '想换成「' || p_proposed_value || '」，一起看看吗？';
    end case;

    -- Create notification
    insert into public.notifications(
      recipient_id, actor_id, type, source_id, title, body
    ) values (
      v_partner_id, v_actor, 'space_setting_request', v_request.id,
      v_notification_title, v_notification_body
    );
  end if;

  return v_request;
end;
$$;

grant execute on function public.create_couple_setting_request(public.setting_request_type, text, text) to authenticated;

create or replace function public.approve_couple_setting_request(
  p_request_id uuid
)
returns public.couple_setting_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.couple_setting_requests;
  v_partner_name text;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock request for update
  select * into v_request
  from public.couple_setting_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_request.requester_id = v_actor then
    raise exception 'cannot approve own request' using errcode = '42501';
  end if;

  -- Verify actor is a member of the space
  if not public.is_active_space_member(v_request.space_id, v_actor) then
    raise exception 'not a space member' using errcode = '42501';
  end if;

  -- Update request status
  update public.couple_setting_requests
  set status = 'approved', responded_at = now(), responder_id = v_actor
  where id = p_request_id
  returning * into v_request;

  -- Apply the actual setting change based on type
  case v_request.setting_type
    when 'space_name' then
      update public.spaces
      set name = v_request.proposed_value
      where id = v_request.space_id;
    when 'relationship_started_on' then
      update public.profiles
      set relationship_started_on = v_request.proposed_value::date
      where id in (
        select user_id from public.space_members
        where space_id = v_request.space_id and active
      );
    when 'theme' then
      update public.spaces
      set theme = v_request.proposed_value
      where id = v_request.space_id;
  end case;

  -- Create response notification
  select display_name into v_partner_name
  from public.profiles where id = v_actor;

  insert into public.notifications(
    recipient_id, actor_id, type, source_id, title, body
  ) values (
    v_request.requester_id, v_actor, 'space_setting_response', p_request_id,
    v_partner_name || ' 同意了修改',
    '你们的' || case v_request.setting_type
      when 'space_name' then '空间名称'
      when 'relationship_started_on' then '开始日期'
      when 'theme' then '小世界皮肤'
    end || '已更新'
  );

  return v_request;
end;
$$;

grant execute on function public.approve_couple_setting_request(uuid) to authenticated;

create or replace function public.reject_couple_setting_request(
  p_request_id uuid
)
returns public.couple_setting_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.couple_setting_requests;
  v_partner_name text;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_request
  from public.couple_setting_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_request.requester_id = v_actor then
    raise exception 'cannot reject own request' using errcode = '42501';
  end if;

  if not public.is_active_space_member(v_request.space_id, v_actor) then
    raise exception 'not a space member' using errcode = '42501';
  end if;

  update public.couple_setting_requests
  set status = 'rejected', responded_at = now(), responder_id = v_actor
  where id = p_request_id
  returning * into v_request;

  -- Create response notification
  select display_name into v_partner_name
  from public.profiles where id = v_actor;

  insert into public.notifications(
    recipient_id, actor_id, type, source_id, title, body
  ) values (
    v_request.requester_id, v_actor, 'space_setting_response', p_request_id,
    v_partner_name || ' 暂不修改',
    '对方觉得现在这样就挺好'
  );

  return v_request;
end;
$$;

grant execute on function public.reject_couple_setting_request(uuid) to authenticated;

create or replace function public.cancel_couple_setting_request(
  p_request_id uuid
)
returns public.couple_setting_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.couple_setting_requests;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_request
  from public.couple_setting_requests
  where id = p_request_id and status = 'pending' and requester_id = v_actor
  for update;

  if not found then
    raise exception 'request not found or not cancellable' using errcode = 'P0002';
  end if;

  update public.couple_setting_requests
  set status = 'cancelled', cancelled_at = now()
  where id = p_request_id
  returning * into v_request;

  -- Delete corresponding unread notification
  delete from public.notifications
  where source_id = p_request_id
    and type = 'space_setting_request'
    and is_read = false;

  return v_request;
end;
$$;

grant execute on function public.cancel_couple_setting_request(uuid) to authenticated;

create or replace function public.update_partner_nickname(
  p_nickname text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_nickname is not null and (char_length(p_nickname) < 1 or char_length(p_nickname) > 12) then
    raise exception '爱称需要 1 到 12 个字符' using errcode = '22023';
  end if;

  update public.profiles
  set partner_nickname = p_nickname
  where id = v_actor;
end;
$$;

grant execute on function public.update_partner_nickname(text) to authenticated;

commit;


-- ============================================================================
-- Source history: 202607270009_profile_settings.sql
-- ============================================================================

alter table if exists public.profiles
add column if not exists skin text default 'cream' check (skin in ('cream', 'rose', 'galaxy'));

alter table if exists public.profiles
add column if not exists partner_nickname text check (char_length(partner_nickname) between 1 and 12);

create or replace function public.update_partner_nickname(
  p_nickname text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_nickname is not null and (char_length(p_nickname) < 1 or char_length(p_nickname) > 12) then
    raise exception '爱称需要 1 到 12 个字符' using errcode = '22023';
  end if;

  update public.profiles
  set partner_nickname = p_nickname
  where id = v_actor;
end;
$$;

grant execute on function public.update_partner_nickname(text) to authenticated;

create or replace function public.update_profile_skin(
  p_skin text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_skin not in ('cream', 'rose', 'galaxy') then
    raise exception '无效的皮肤选项' using errcode = '22023';
  end if;

  update public.profiles
  set skin = p_skin
  where id = v_actor;
end;
$$;

grant execute on function public.update_profile_skin(text) to authenticated;


-- ============================================================================
-- Source history: 202607270010_partner_nickname_notification.sql
-- ============================================================================

alter type public.notification_type add value if not exists 'partner_nickname_updated';

create or replace function public.update_partner_nickname(
  p_nickname text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_space_id uuid;
  v_partner_id uuid;
  v_author_name text;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_nickname is not null and (char_length(p_nickname) < 1 or char_length(p_nickname) > 12) then
    raise exception '爱称需要 1 到 12 个字符' using errcode = '22023';
  end if;

  update public.profiles
  set partner_nickname = p_nickname
  where id = v_actor;

  -- 获取空间 ID
  select space_id into v_space_id
  from public.space_members
  where user_id = v_actor and active;

  if v_space_id is not null then
    -- 获取伴侣 ID
    select user_id into v_partner_id
    from public.space_members
    where space_id = v_space_id and active and user_id <> v_actor;

    if v_partner_id is not null then
      -- 获取当前用户的昵称
      select display_name into v_author_name
      from public.profiles where id = v_actor;

      -- 创建通知
      insert into public.notifications(
        recipient_id, actor_id, type, source_id, title, body
      ) values (
        v_partner_id, v_actor, 'partner_nickname_updated', null,
        v_author_name || ' 给你留了一个新的称呼',
        '「' || p_nickname || '」'
      );
    end if;
  end if;
end;
$$;

grant execute on function public.update_partner_nickname(text) to authenticated;


-- ============================================================================
-- Source history: 202607280001_fix_notification_types.sql
-- ============================================================================

create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare 
  v_actor uuid := auth.uid();
  v_space uuid;
  v_recipient uuid;
  v_type text;
  v_body text;
  v_display_name text;
begin
  v_space := public.resolve_single_active_space(v_actor); 
  if v_space is null then return; end if;
  
  select m.user_id into v_recipient 
  from public.space_members m 
  where m.space_id = v_space and m.active and m.user_id <> v_actor 
  limit 1;
  if v_recipient is null then return; end if;

  select p.display_name into v_display_name 
  from public.profiles p 
  where p.id = v_actor;

  case p_kind
    when 'avatar' then
      v_type := 'profile_avatar_updated';
      v_body := '对方更换了头像';
    when 'name' then
      v_type := 'profile_nickname_updated';
      v_body := coalesce(v_display_name, '对方') || ' 更新了昵称';
    else
      v_type := 'profile_updated';
      v_body := '对方更新了资料';
  end case;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
  values(v_recipient, v_actor, v_type, v_actor, '资料更新', v_body);
end;
$$;

create or replace function public.create_calendar_event_notification(
  p_event_id uuid,
  p_actor_id uuid,
  p_is_update boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_space_id uuid;
  v_recipient_id uuid;
  v_event record;
  v_notification_type text;
  v_title text;
  v_body text;
begin
  if p_actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  
  v_space_id := public.resolve_single_active_space(p_actor_id);

  select event.id, event.name, event.creator_id, event.space_id, 
         event.event_date, event.end_date, event.recurrence, 
         event.event_type, event.description, event.location
  into v_event
  from public.calendar_events as event
  where event.id = p_event_id
    and event.space_id = v_space_id;
    
  if not found then
    raise exception 'calendar event not found' using errcode = '404';
  end if;

  -- Build title based on event_type and action
  v_notification_type := case when p_is_update then 'calendar_event_updated' else 'calendar_event_created' end;
  
  case v_event.event_type
    when 'anniversary' then
      v_title := case when p_is_update then '修改了纪念日' else '新增了一项纪念日' end;
    when 'birthday' then
      v_title := case when p_is_update then '更新了生日' else '新增了生日' end;
    when 'date' then
      v_title := case when p_is_update then '更新了约会安排' else '安排了一次约会' end;
    when 'travel' then
      v_title := case when p_is_update then '调整了旅行计划' else '新增了一次旅行' end;
    when 'todo' then
      v_title := case when p_is_update then '更新了待办' else '新增了一个待办' end;
    else
      v_title := case when p_is_update then '修改了事件' else '新增了一项其他事件' end;
  end case;

  -- Build body with event details
  v_body := v_event.name;
  if v_event.event_date is not null then
    v_body := v_body || ' · ' || to_char(v_event.event_date, 'FMMonth FMDD日');
  end if;
  if v_event.location is not null and v_event.location <> '' then
    v_body := v_body || ' · ' || v_event.location;
  end if;

  -- Insert notification for partner only
  select m.user_id into v_recipient_id
  from public.space_members m
  where m.space_id = v_space_id and m.active and m.user_id <> p_actor_id
  limit 1;
  
  if v_recipient_id is not null then
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
    values (v_recipient_id, p_actor_id, v_notification_type, v_event.id, v_title, v_body);
  end if;
end;
$$;

revoke execute on function public.create_calendar_event_notification(uuid, uuid, boolean) from public, anon;

grant execute on function public.create_calendar_event_notification(uuid, uuid, boolean) to authenticated;

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
  
  -- Trigger notification immediately for the partner
  perform public.create_calendar_event_notification(v_id, v_actor, false);
  
  return v_id;
end;
$$;

revoke execute on function public.create_space_calendar_event_v2(
  uuid, text, date, date, text, public.recurrence_type, boolean, text, text, text
) from public, anon;

grant execute on function public.create_space_calendar_event_v2(
  uuid, text, date, date, text, public.recurrence_type, boolean, text, text, text
) to authenticated;


-- ============================================================================
-- Source history: 202607280002_notification_enum_fix.sql
-- ============================================================================

alter type public.notification_type add value if not exists 'profile_nickname_updated';

alter type public.notification_type add value if not exists 'profile_avatar_updated';

alter type public.notification_type add value if not exists 'calendar_event_created';

alter type public.notification_type add value if not exists 'calendar_event_updated';

alter type public.notification_type add value if not exists 'mood_updated';

alter type public.notification_type add value if not exists 'memory_updated';

create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare 
  v_actor uuid := auth.uid();
  v_space uuid;
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_display_name text;
begin
  v_space := public.resolve_single_active_space(v_actor); 
  if v_space is null then return; end if;
  
  select m.user_id into v_recipient 
  from public.space_members m 
  where m.space_id = v_space and m.active and m.user_id <> v_actor 
  limit 1;
  if v_recipient is null then return; end if;

  select p.display_name into v_display_name 
  from public.profiles p 
  where p.id = v_actor;

  case p_kind
    when 'avatar' then
      v_type := 'profile_avatar_updated';
      v_title := '更换了头像';
      v_body := '';
    when 'name' then
      v_type := 'profile_nickname_updated';
      v_title := '更新了昵称';
      -- Body contains ONLY the new nickname value for frontend formatting
      v_body := coalesce(v_display_name, '');
    else
      v_type := 'profile_updated';
      v_title := '更新了资料';
      v_body := '';
  end case;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
  values(v_recipient, v_actor, v_type, v_actor, v_title, v_body);
end;
$$;

create or replace function public.create_calendar_event_notification(
  p_event_id uuid,
  p_actor_id uuid,
  p_is_update boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_space_id uuid;
  v_recipient_id uuid;
  v_event record;
  v_notification_type public.notification_type;
  v_title text;
  v_body text;
begin
  if p_actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  
  v_space_id := public.resolve_single_active_space(p_actor_id);

  select event.id, event.name, event.creator_id, event.space_id, 
         event.event_date, event.end_date, event.recurrence, 
         event.event_type, event.description
  into v_event
  from public.calendar_events as event
  where event.id = p_event_id
    and event.space_id = v_space_id;
    
  if not found then
    raise exception 'calendar event not found' using errcode = '404';
  end if;

  -- Build title based on event_type and action
  v_notification_type := case when p_is_update then 'calendar_event_updated' else 'calendar_event_created' end;
  
  case v_event.event_type
    when 'anniversary' then
      v_title := case when p_is_update then '修改了纪念日' else '新增了一项纪念日' end;
    when 'birthday' then
      v_title := case when p_is_update then '更新了生日' else '新增了生日' end;
    when 'date' then
      v_title := case when p_is_update then '更新了约会安排' else '安排了一次约会' end;
    when 'travel' then
      v_title := case when p_is_update then '调整了旅行计划' else '新增了一次旅行' end;
    when 'todo' then
      v_title := case when p_is_update then '更新了待办' else '新增了一个待办' end;
    else
      v_title := case when p_is_update then '修改了事件' else '新增了一项其他事件' end;
  end case;

  -- Build body with event details
  v_body := v_event.name;
  if v_event.event_date is not null then
    v_body := v_body || ' · ' || to_char(v_event.event_date, 'FMMonth FMDD日');
  end if;

  -- Insert notification for partner only
  select m.user_id into v_recipient_id
  from public.space_members m
  where m.space_id = v_space_id and m.active and m.user_id <> p_actor_id
  limit 1;
  
  if v_recipient_id is not null then
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
    values (v_recipient_id, p_actor_id, v_notification_type, v_event.id, v_title, v_body);
  end if;
end;
$$;

revoke execute on function public.create_calendar_event_notification(uuid, uuid, boolean) from public, anon;

grant execute on function public.create_calendar_event_notification(uuid, uuid, boolean) to authenticated;

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
  
  -- Trigger notification immediately for the partner
  perform public.create_calendar_event_notification(v_id, v_actor, false);
  
  return v_id;
end;
$$;

revoke execute on function public.create_space_calendar_event_v2(
  uuid, text, date, date, text, public.recurrence_type, boolean, text, text, text
) from public, anon;

grant execute on function public.create_space_calendar_event_v2(
  uuid, text, date, date, text, public.recurrence_type, boolean, text, text, text
) to authenticated;

create or replace function public.update_calendar_event_notification(
  p_event_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  
  perform public.create_calendar_event_notification(p_event_id, v_actor, true);
end;
$$;

revoke execute on function public.update_calendar_event_notification(uuid) from public, anon;

grant execute on function public.update_calendar_event_notification(uuid) to authenticated;


-- ============================================================================
-- Source history: 202607280004_add_notification_metadata.sql
-- ============================================================================

alter table public.notifications
add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notifications add column if not exists related_entry_id uuid;

create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare 
  v_actor uuid := auth.uid();
  v_space uuid;
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_display_name text;
  v_metadata jsonb;
begin
  v_space := public.resolve_single_active_space(v_actor); 
  if v_space is null then return; end if;
  
  select m.user_id into v_recipient 
  from public.space_members m 
  where m.space_id = v_space and m.active and m.user_id <> v_actor 
  limit 1;
  if v_recipient is null then return; end if;

  select p.display_name into v_display_name 
  from public.profiles p 
  where p.id = v_actor;

  v_metadata := '{}'::jsonb;
  
  case p_kind
    when 'avatar' then
      v_type := 'profile_avatar_updated';
      v_title := '更换了头像';
      v_body := '';
    when 'name' then
      v_type := 'profile_nickname_updated';
      v_title := '更新了昵称';
      v_body := coalesce(v_display_name, '');
      v_metadata := jsonb_build_object('nickname_snapshot', v_display_name);
    else
      v_type := 'profile_updated';
      v_title := '更新了资料';
      v_body := '';
  end case;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body, metadata) 
  values(v_recipient, v_actor, v_type, v_actor, v_title, v_body, v_metadata);
end;
$$;

create or replace function public.create_calendar_event_notification(
  p_event_id uuid,
  p_actor_id uuid,
  p_is_update boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_space_id uuid;
  v_recipient_id uuid;
  v_event record;
  v_notification_type public.notification_type;
  v_title text;
  v_body text;
  v_metadata jsonb;
begin
  if p_actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  
  v_space_id := public.resolve_single_active_space(p_actor_id);

  select event.id, event.name, event.creator_id, event.space_id, 
         event.event_date, event.end_date, event.recurrence, 
         event.event_type, event.description, event.location
  into v_event
  from public.calendar_events as event
  where event.id = p_event_id
    and event.space_id = v_space_id;
    
  if not found then
    raise exception 'calendar event not found' using errcode = '404';
  end if;

  -- Build title based on event_type and action
  v_notification_type := case when p_is_update then 'calendar_event_updated' else 'calendar_event_created' end;
  
  case v_event.event_type
    when 'anniversary' then
      v_title := case when p_is_update then '修改了纪念日' else '新增了一项纪念日' end;
    when 'birthday' then
      v_title := case when p_is_update then '更新了生日' else '新增了生日' end;
    when 'date' then
      v_title := case when p_is_update then '更新了约会安排' else '安排了一次约会' end;
    when 'travel' then
      v_title := case when p_is_update then '调整了旅行计划' else '新增了一次旅行' end;
    when 'todo' then
      v_title := case when p_is_update then '更新了待办' else '新增了一个待办' end;
    else
      v_title := case when p_is_update then '修改了事件' else '新增了一项其他事件' end;
  end case;

  -- Build body with event details
  v_body := v_event.name;
  if v_event.event_date is not null then
    v_body := v_body || ' · ' || to_char(v_event.event_date, 'FMMonth FMDD日');
  end if;
  if v_event.location is not null and v_event.location <> '' then
    v_body := v_body || ' · ' || v_event.location;
  end if;

  -- Build metadata with structured snapshot
  v_metadata := jsonb_build_object(
    'event_type', v_event.event_type,
    'title_snapshot', v_event.name,
    'start_at', to_char(v_event.event_date, 'YYYY-MM-DD')
  );
  if v_event.location is not null and v_event.location <> '' then
    v_metadata := v_metadata || jsonb_build_object('location_snapshot', v_event.location);
  end if;
  if v_event.end_date is not null then
    v_metadata := v_metadata || jsonb_build_object('end_at', to_char(v_event.end_date, 'YYYY-MM-DD'));
  end if;

  -- Insert notification for partner only
  select m.user_id into v_recipient_id
  from public.space_members m
  where m.space_id = v_space_id and m.active and m.user_id <> p_actor_id
  limit 1;
  
  if v_recipient_id is not null then
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body, metadata)
    values (v_recipient_id, p_actor_id, v_notification_type, v_event.id, v_title, v_body, v_metadata);
  end if;
end;
$$;

revoke execute on function public.create_calendar_event_notification(uuid, uuid, boolean) from public, anon;

grant execute on function public.create_calendar_event_notification(uuid, uuid, boolean) to authenticated;


-- ============================================================================
-- Source history: 202607280005_fix_notification_triggers.sql
-- ============================================================================

create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare 
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_space uuid;
  v_actor uuid;
  v_event_name text;
  v_event_date date;
  v_event_type text;
begin
  v_actor := coalesce((to_jsonb(new)->>'creator_id')::uuid, (to_jsonb(new)->>'author_id')::uuid);
  v_space := (to_jsonb(new)->>'space_id')::uuid;
  select member.user_id into v_recipient from public.space_members member where member.space_id = v_space and member.active and member.user_id <> v_actor limit 1;
  if v_recipient is null then return new; end if;
  
  if tg_table_name = 'memory_entries' then
    v_type := 'memory_created';
    v_title := '新增回忆';
    v_body := '';
  elsif tg_table_name = 'mood_entries' then
    v_type := 'mood_created';
    v_title := '更新心情';
    v_body := new.body;
  elsif tg_table_name = 'calendar_events' then
    -- Use specific event data
    v_event_name := new.name;
    v_event_date := new.event_date;
    v_event_type := new.event_type;
    
    case v_event_type
      when 'anniversary' then v_title := '新增了一项纪念日';
      when 'birthday' then v_title := '新增了生日';
      when 'date' then v_title := '安排了一次约会';
      when 'travel' then v_title := '新增了一次旅行';
      when 'todo' then v_title := '新增了一个待办';
      else v_title := '新增了一项其他事件';
    end case;
    
    v_body := v_event_name;
    if v_event_date is not null then
      v_body := v_body || ' · ' || to_char(v_event_date, 'FMMonth FMDD日');
    end if;
    
    v_type := 'calendar_event_created';
  else
    return new;
  end if;
  
  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
  values(v_recipient, v_actor, v_type, new.id, v_title, v_body);
  
  return new;
end;
$$;

create or replace function public.notify_partner_journal() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid;
begin
  if new.entry_type <> 'today' then return new; end if;
  select m.user_id into v_recipient from public.space_members m where m.space_id = new.space_id and m.active and m.user_id <> new.author_id limit 1;
  if v_recipient is not null then 
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
    values(v_recipient, new.author_id, 'journal_created', new.id, '寄来一封信', new.title); 
  end if;
  return new;
end;
$$;

create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare 
  v_actor uuid := auth.uid();
  v_space uuid;
  v_recipient uuid;
  v_body text;
  v_type public.notification_type;
  v_title text;
  v_display_name text;
begin
  v_space := public.resolve_single_active_space(v_actor); 
  if v_space is null then return; end if;
  
  select m.user_id into v_recipient 
  from public.space_members m 
  where m.space_id = v_space and m.active and m.user_id <> v_actor 
  limit 1;
  if v_recipient is null then return; end if;

  select p.display_name into v_display_name 
  from public.profiles p 
  where p.id = v_actor;

  case p_kind
    when 'avatar' then
      v_type := 'profile_avatar_updated';
      v_title := '更换了头像';
      v_body := '';
    when 'name' then
      v_type := 'profile_nickname_updated';
      v_title := '更新了昵称';
      v_body := coalesce(v_display_name, '');
    else
      v_type := 'profile_updated';
      v_title := '更新了资料';
      v_body := '';
  end case;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
  values(v_recipient, v_actor, v_type, v_actor, v_title, v_body);
end;
$$;

revoke execute on function public.notify_partner_profile_change(text) from public, anon;

grant execute on function public.notify_partner_profile_change(text) to authenticated;


-- ============================================================================
-- Source history: 202607280007_notification_is_active.sql
-- ============================================================================

alter table public.notifications add column if not exists is_active boolean not null default true;

drop policy if exists "users can read own notifications" on public.notifications;

create policy "users can read own notifications"
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and is_active = true
);


-- ============================================================================
-- Source history: 202607280008_simplify_letters_and_notifications.sql
-- ============================================================================

alter table public.notifications add column if not exists is_active boolean not null default true;

drop policy if exists "users can read own notifications" on public.notifications;

create policy "users can read own notifications"
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and is_active = true
);

drop policy if exists "active members can read visible journal entries" on public.journal_entries;

create policy "active members can read visible journal entries"
on public.journal_entries for select to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    (author_id = auth.uid())
    or (
      recipient_id = auth.uid()
      and (
        (deleted_at is null and withdrawn_at is null
          and (entry_type = 'today' or (entry_type = 'future' and opened_at is not null))
        )
        or (withdrawn_at is not null)
      )
    )
  )
);

drop policy if exists "members can read eligible journal comments" on public.journal_comments;

create policy "members can read eligible journal comments"
on public.journal_comments for select to authenticated
using (
  deleted_at is null
  and public.can_interact_with_journal(entry_id)
  and exists (
    select 1 from public.journal_entries as journal
    where journal.id = journal_comments.entry_id
      and journal.space_id = journal_comments.space_id
      and journal.deleted_at is null
      and journal.withdrawn_at is null
  )
);

create or replace function public.notify_partner_journal() returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_recipient uuid;
  v_title text;
  v_body text;
begin
  if new.entry_type <> 'today' then return new; end if;
  select m.user_id into v_recipient from public.space_members m
  where m.space_id = new.space_id and m.active and m.user_id <> new.author_id limit 1;
  if v_recipient is not null then
    v_title := '寄来一封信';
    v_body := coalesce(new.excerpt, left(coalesce(new.plain_text, ''), 80));
    if v_body = '' then v_body := '一封新的信'; end if;
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
    values(v_recipient, new.author_id, 'journal_created', new.id, v_title, v_body);
  end if;
  return new;
end;
$$;

create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_space uuid;
  v_actor uuid;
begin
  v_actor := coalesce((to_jsonb(new)->>'creator_id')::uuid, (to_jsonb(new)->>'author_id')::uuid);
  v_space := (to_jsonb(new)->>'space_id')::uuid;
  select member.user_id into v_recipient from public.space_members member
  where member.space_id = v_space and member.active and member.user_id <> v_actor limit 1;
  if v_recipient is null then return new; end if;

  if tg_table_name = 'memory_entries' then
    v_type := 'memory_created';
    v_title := '新增了一段回忆';
    v_body := coalesce(new.title, left(coalesce(new.body, ''), 60));
    if v_body = '' then v_body := ''; end if;
  elsif tg_table_name = 'mood_entries' then
    v_type := 'mood_created';
    v_title := '更新了心情';
    v_body := coalesce(new.body, '');
  else
    return new;
  end if;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
  values(v_recipient, v_actor, v_type, new.id, v_title, v_body);
  return new;
end;
$$;

create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_space uuid;
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_display_name text;
begin
  v_space := public.resolve_single_active_space(v_actor);
  if v_space is null then return; end if;

  select m.user_id into v_recipient
  from public.space_members m
  where m.space_id = v_space and m.active and m.user_id <> v_actor
  limit 1;
  if v_recipient is null then return; end if;

  select p.display_name into v_display_name
  from public.profiles p where p.id = v_actor;

  case p_kind
    when 'avatar' then
      v_type := 'profile_avatar_updated';
      v_title := '更换了头像';
      v_body := '';
    when 'name' then
      v_type := 'profile_nickname_updated';
      v_title := '更新了昵称';
      v_body := coalesce(v_display_name, '');
    else
      v_type := 'profile_updated';
      v_title := '更新了资料';
      v_body := '';
  end case;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
  values(v_recipient, v_actor, v_type, v_actor, v_title, v_body);
end;
$$;

revoke execute on function public.notify_partner_profile_change(text) from public, anon;

grant execute on function public.notify_partner_profile_change(text) to authenticated;

create or replace function public.create_calendar_event_notification(
  p_event_id uuid,
  p_actor_id uuid,
  p_is_update boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_space_id uuid;
  v_recipient_id uuid;
  v_event record;
  v_notification_type public.notification_type;
  v_title text;
  v_body text;
begin
  if p_actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;

  v_space_id := public.resolve_single_active_space(p_actor_id);

  select event.id, event.name, event.creator_id, event.space_id,
         event.event_date, event.end_date, event.recurrence,
         event.event_type, event.description
  into v_event
  from public.calendar_events as event
  where event.id = p_event_id and event.space_id = v_space_id;

  if not found then
    raise exception 'calendar event not found' using errcode = '404';
  end if;

  v_notification_type := case when p_is_update then 'calendar_event_updated' else 'calendar_event_created' end;

  case v_event.event_type
    when 'anniversary' then
      v_title := case when p_is_update then '修改了纪念日' else '创建了纪念日' end;
    when 'birthday' then
      v_title := case when p_is_update then '更新了生日' else '新增了生日' end;
    when 'date' then
      v_title := case when p_is_update then '更新了约会' else '创建了约会' end;
    when 'travel' then
      v_title := case when p_is_update then '调整了旅行计划' else '新增了一次旅行' end;
    when 'todo' then
      v_title := case when p_is_update then '更新了待办' else '新增了一个待办' end;
    else
      v_title := case when p_is_update then '修改了事件' else '新增了一项事件' end;
  end case;

  v_body := v_event.name;
  if v_event.event_date is not null then
    v_body := v_body || ' · ' || to_char(v_event.event_date, 'FMMonth FMDD日');
  end if;

  select m.user_id into v_recipient_id
  from public.space_members m
  where m.space_id = v_space_id and m.active and m.user_id <> p_actor_id
  limit 1;

  if v_recipient_id is not null then
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
    values (v_recipient_id, p_actor_id, v_notification_type, v_event.id, v_title, v_body);
  end if;
end;
$$;

revoke execute on function public.create_calendar_event_notification(uuid, uuid, boolean) from public, anon;

grant execute on function public.create_calendar_event_notification(uuid, uuid, boolean) to authenticated;


-- ============================================================================
-- Source history: 202607280009_finalize_letter_notification_state.sql
-- ============================================================================

create or replace function public.withdraw_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.journal_entries
  set withdrawn_at = clock_timestamp()
  where id = p_entry_id
    and author_id = auth.uid()
    and withdrawn_at is null
    and clock_timestamp() <= locked_at;

  if not found then
    raise exception 'letter withdraw window closed or already withdrawn'
      using errcode = '42501';
  end if;

  update public.notifications
  set is_active = false, is_read = true
  where source_id = p_entry_id
    and recipient_id <> auth.uid()
    and is_active = true;
end;
$$;

revoke execute on function public.withdraw_letter_diary(uuid)
  from public, anon;

grant execute on function public.withdraw_letter_diary(uuid)
  to authenticated;

create or replace function public.mark_letter_read(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.journal_entries
    where id = p_entry_id
      and recipient_id = auth.uid()
      and withdrawn_at is null
  )
  into v_exists;

  if not v_exists then
    raise exception 'letter not found or already withdrawn'
      using errcode = 'P0002';
  end if;

  update public.journal_entries
  set opened_at = coalesce(opened_at, clock_timestamp()),
      opened_by = coalesce(opened_by, auth.uid())
  where id = p_entry_id
    and recipient_id = auth.uid()
    and withdrawn_at is null;

  update public.notifications
  set is_read = true
  where source_id = p_entry_id
    and recipient_id = auth.uid()
    and is_active = true
    and is_read = false;
end;
$$;

revoke execute on function public.mark_letter_read(uuid)
  from public, anon;

grant execute on function public.mark_letter_read(uuid)
  to authenticated;

drop policy if exists "active members can read visible journal entries"
  on public.journal_entries;

create policy "active members can read visible journal entries"
on public.journal_entries
for select
to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    author_id = auth.uid()
    or (
      recipient_id = auth.uid()
      and deleted_at is null
      and withdrawn_at is null
      and (
        entry_type = 'today'
        or (entry_type = 'future' and opened_at is not null)
      )
    )
  )
);

create or replace function public.get_letter_withdrawal_status(p_entry_id uuid)
returns table(id uuid, withdrawn_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select entry.id, entry.withdrawn_at
  from public.journal_entries as entry
  where entry.id = p_entry_id
    and entry.recipient_id = auth.uid()
    and entry.withdrawn_at is not null
    and public.is_active_space_member(entry.space_id);
$$;

revoke execute on function public.get_letter_withdrawal_status(uuid) from public, anon;

grant execute on function public.get_letter_withdrawal_status(uuid) to authenticated;


-- ============================================================================
-- Source history: 20260728110538_resolve_capsule_rpc_overload.sql
-- ============================================================================

alter function public.seal_future_diary(
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  text,
  uuid
)
rename to seal_future_diary_with_image;

revoke execute on function public.seal_future_diary(
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  text
) from public, anon;

grant execute on function public.seal_future_diary(
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  text
) to authenticated, service_role;

-- ============================================================================
-- Explicit Supabase service-role baseline
-- ============================================================================
-- A fresh Supabase project normally supplies equivalent managed defaults.
-- Keep them explicit so the application schema remains recoverable after a
-- clean public-schema rebuild and does not depend on implicit ACL state.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
