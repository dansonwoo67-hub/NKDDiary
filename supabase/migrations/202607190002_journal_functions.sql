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

-- Safe pre-open interface: this function deliberately returns metadata only.
-- Full future rows remain governed by journal_entries RLS and cannot be read by
-- a recipient until open_future_diary has recorded opened_at.
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
