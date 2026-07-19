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
