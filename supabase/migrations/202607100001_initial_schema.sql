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
