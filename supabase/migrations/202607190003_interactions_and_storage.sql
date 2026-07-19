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
  reason text not null check (reason in ('database_write_failed', 'diary_deleted')),
  attempts integer not null default 0 check (attempts >= 0),
  requested_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  unique (space_id, author_id, entry_id)
);

alter table public.journal_image_cleanup_jobs enable row level security;
revoke all on table public.journal_image_cleanup_jobs from public, anon, authenticated;
grant select, update, delete on table public.journal_image_cleanup_jobs to service_role;

create or replace function public.enqueue_journal_image_cleanup(
  p_space_id uuid,
  p_entry_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_image_path text;
begin
  if v_user_id is null
    or not public.is_active_space_member(p_space_id, v_user_id)
  then
    raise exception 'active space membership required' using errcode = '42501';
  end if;
  if p_reason not in ('database_write_failed', 'diary_deleted') then
    raise exception 'invalid cleanup reason' using errcode = '22023';
  end if;

  v_image_path := p_space_id::text || '/' || v_user_id::text || '/' || p_entry_id::text || '.webp';
  if exists (
    select 1
    from public.journal_entries as journal
    where journal.id = p_entry_id
      and journal.space_id = p_space_id
      and journal.author_id = v_user_id
      and journal.image_path = v_image_path
      and (
        journal.entry_type <> 'today'
        or clock_timestamp() > journal.locked_at
      )
  ) then
    raise exception 'journal image is retained' using errcode = '55000';
  end if;

  insert into public.journal_image_cleanup_jobs (
    space_id, author_id, entry_id, reason
  ) values (
    p_space_id, v_user_id, p_entry_id, p_reason
  )
  on conflict (space_id, author_id, entry_id) do update
  set reason = excluded.reason,
      requested_at = now();
end;
$$;

revoke execute on function public.enqueue_journal_image_cleanup(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.enqueue_journal_image_cleanup(uuid, uuid, text) to authenticated;

drop policy if exists "authors can upload journal images" on storage.objects;
create policy "authors can upload journal images"
on storage.objects for insert to authenticated
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
);

drop policy if exists "authors can update journal images" on storage.objects;
create policy "authors can update journal images"
on storage.objects for update to authenticated
using (
  bucket_id = 'journal-images'
  and owner_id = (select auth.uid())::text
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
);

drop policy if exists "authors can remove journal images" on storage.objects;
create policy "authors can remove journal images"
on storage.objects for delete to authenticated
using (
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
);

drop policy if exists "authorized readers can read journal images" on storage.objects;
create policy "authorized readers can read journal images"
on storage.objects for select to authenticated
using (
  bucket_id = 'journal-images'
  and exists (
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
