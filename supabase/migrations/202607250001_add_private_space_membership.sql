create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  site_name text not null default 'NKD Diary' check (char_length(site_name) between 1 and 40),
  relationship_started_on date not null default date '2024-01-01',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'member' check (role in ('owner', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create trigger spaces_set_updated_at before update on public.spaces
for each row execute function public.set_updated_at();

insert into public.spaces (site_name, relationship_started_on)
select
  'NKD Diary',
  coalesce(min(relationship_started_on), date '2024-01-01')
from public.profiles
where not exists (select 1 from public.spaces);

insert into public.space_members (space_id, user_id, role)
select
  (select id from public.spaces order by created_at limit 1),
  profiles.id,
  case
    when row_number() over (order by profiles.created_at, profiles.id) = 1 then 'owner'
    else 'member'
  end
from public.profiles
where not exists (
  select 1
  from public.space_members
  where space_members.user_id = profiles.id
);

alter table public.letters add column if not exists space_id uuid references public.spaces(id) on delete restrict;
alter table public.calendar_events add column if not exists space_id uuid references public.spaces(id) on delete restrict;
alter table public.notifications add column if not exists space_id uuid references public.spaces(id) on delete restrict;

update public.letters
set space_id = (select space_id from public.space_members where user_id = letters.author_id and is_active order by created_at limit 1)
where space_id is null;

update public.calendar_events
set space_id = (select space_id from public.space_members where user_id = calendar_events.creator_id and is_active order by created_at limit 1)
where space_id is null;

update public.notifications
set space_id = (select space_id from public.space_members where user_id = notifications.recipient_id and is_active order by created_at limit 1)
where space_id is null;

alter table public.letters alter column space_id set not null;
alter table public.calendar_events alter column space_id set not null;
alter table public.notifications alter column space_id set not null;

create index if not exists space_members_user_id_idx on public.space_members(user_id);
create index if not exists letters_space_id_idx on public.letters(space_id);
create unique index if not exists letters_space_author_date_idx on public.letters(space_id, author_id, letter_date);
create index if not exists calendar_events_space_id_idx on public.calendar_events(space_id);
create index if not exists notifications_space_recipient_idx on public.notifications(space_id, recipient_id);

create or replace function public.is_active_space_member(target_space_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select exists (
    select 1
    from public.space_members
    where space_id = target_space_id
      and user_id = auth.uid()
      and is_active
  );
$$;

create or replace function public.current_space_id()
returns uuid
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select space_id
  from public.space_members
  where user_id = auth.uid()
    and is_active
  order by created_at
  limit 1;
$$;

create or replace function public.shares_active_space_with(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select exists (
    select 1
    from public.space_members viewer
    join public.space_members target on target.space_id = viewer.space_id
    where viewer.user_id = auth.uid()
      and target.user_id = target_user_id
      and viewer.is_active
      and target.is_active
  );
$$;

create or replace function public.assign_current_space_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  active_space_id uuid;
begin
  active_space_id := public.current_space_id();

  if tg_op = 'INSERT' then
    if new.space_id is null then
      new.space_id := active_space_id;
    end if;
  elsif tg_op = 'UPDATE' then
    new.space_id := old.space_id;
  end if;

  return new;
end;
$$;

create trigger letters_assign_space before insert or update on public.letters
for each row execute function public.assign_current_space_id();

create trigger calendar_events_assign_space before insert or update on public.calendar_events
for each row execute function public.assign_current_space_id();

create trigger notifications_assign_space before insert or update on public.notifications
for each row execute function public.assign_current_space_id();

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

drop policy if exists "couple members can read profiles" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "couple members can read letters" on public.letters;
drop policy if exists "users can insert own letter" on public.letters;
drop policy if exists "users can edit own letter within 24 hours" on public.letters;
drop policy if exists "couple members can read open responses" on public.letter_open_responses;
drop policy if exists "couple members can create own open response" on public.letter_open_responses;
drop policy if exists "couple members can read annotations" on public.annotations;
drop policy if exists "couple members can create own annotations" on public.annotations;
drop policy if exists "couple members can update own annotations" on public.annotations;
drop policy if exists "couple members can read annotation replies" on public.annotation_replies;
drop policy if exists "couple members can create own annotation replies" on public.annotation_replies;
drop policy if exists "couple members can read calendar events" on public.calendar_events;
drop policy if exists "couple members can create calendar events" on public.calendar_events;
drop policy if exists "event creator can update calendar events" on public.calendar_events;
drop policy if exists "users can read own notifications" on public.notifications;
drop policy if exists "couple members can create notifications" on public.notifications;
drop policy if exists "users can update own notifications" on public.notifications;

create policy "active members can read their space"
on public.spaces for select to authenticated
using (public.is_active_space_member(id));

create policy "active members can read space members"
on public.space_members for select to authenticated
using (public.is_active_space_member(space_id));

create policy "active members can read shared profiles"
on public.profiles for select to authenticated
using (public.shares_active_space_with(id));

create policy "active users can update own profile"
on public.profiles for update to authenticated
using (id = auth.uid() and public.shares_active_space_with(id))
with check (id = auth.uid() and public.shares_active_space_with(id));

create policy "active members can read letters in their space"
on public.letters for select to authenticated
using (public.is_active_space_member(space_id));

create policy "active members can insert own letters in their space"
on public.letters for insert to authenticated
with check (author_id = auth.uid() and public.is_active_space_member(space_id));

create policy "authors can edit own letters within 24 hours in their space"
on public.letters for update to authenticated
using (author_id = auth.uid() and now() <= editable_until and public.is_active_space_member(space_id))
with check (author_id = auth.uid() and now() <= editable_until and public.is_active_space_member(space_id));

create policy "active members can read open responses for space letters"
on public.letter_open_responses for select to authenticated
using (
  exists (
    select 1 from public.letters
    where letters.id = letter_open_responses.letter_id
      and public.is_active_space_member(letters.space_id)
  )
);

create policy "active members can create own open response for space letters"
on public.letter_open_responses for insert to authenticated
with check (
  reader_id = auth.uid()
  and exists (
    select 1 from public.letters
    where letters.id = letter_open_responses.letter_id
      and public.is_active_space_member(letters.space_id)
  )
);

create policy "active members can read annotations for space letters"
on public.annotations for select to authenticated
using (
  exists (
    select 1 from public.letters
    where letters.id = annotations.letter_id
      and public.is_active_space_member(letters.space_id)
  )
);

create policy "active members can create own annotations for space letters"
on public.annotations for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.letters
    where letters.id = annotations.letter_id
      and public.is_active_space_member(letters.space_id)
  )
);

create policy "active members can update own annotations for space letters"
on public.annotations for update to authenticated
using (
  author_id = auth.uid()
  and exists (
    select 1 from public.letters
    where letters.id = annotations.letter_id
      and public.is_active_space_member(letters.space_id)
  )
)
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.letters
    where letters.id = annotations.letter_id
      and public.is_active_space_member(letters.space_id)
  )
);

create policy "active members can read annotation replies for space letters"
on public.annotation_replies for select to authenticated
using (
  exists (
    select 1
    from public.annotations
    join public.letters on letters.id = annotations.letter_id
    where annotations.id = annotation_replies.annotation_id
      and public.is_active_space_member(letters.space_id)
  )
);

create policy "active members can create own annotation replies for space letters"
on public.annotation_replies for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.annotations
    join public.letters on letters.id = annotations.letter_id
    where annotations.id = annotation_replies.annotation_id
      and public.is_active_space_member(letters.space_id)
  )
);

create policy "active members can read calendar events in their space"
on public.calendar_events for select to authenticated
using (public.is_active_space_member(space_id));

create policy "active members can create calendar events in their space"
on public.calendar_events for insert to authenticated
with check (creator_id = auth.uid() and public.is_active_space_member(space_id));

create policy "creators can update calendar events in their space"
on public.calendar_events for update to authenticated
using (creator_id = auth.uid() and public.is_active_space_member(space_id))
with check (creator_id = auth.uid() and public.is_active_space_member(space_id));

create policy "users can read own notifications in their space"
on public.notifications for select to authenticated
using (recipient_id = auth.uid() and public.is_active_space_member(space_id));

create policy "active members can create notifications in their space"
on public.notifications for insert to authenticated
with check (public.is_active_space_member(space_id) and public.shares_active_space_with(recipient_id));

create policy "users can update own notifications in their space"
on public.notifications for update to authenticated
using (recipient_id = auth.uid() and public.is_active_space_member(space_id))
with check (recipient_id = auth.uid() and public.is_active_space_member(space_id));

grant select on public.spaces, public.space_members to authenticated;
grant execute on function public.is_active_space_member(uuid) to authenticated;
grant execute on function public.current_space_id() to authenticated;
grant execute on function public.shares_active_space_with(uuid) to authenticated;
revoke execute on function public.assign_current_space_id() from public;
