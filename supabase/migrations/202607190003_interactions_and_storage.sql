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

-- The legacy letter feature already owns this table name. Keep those rows and
-- policies intact under an explicit name before adding journal interactions.
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
  where id = p_entry_id and entry_type = 'future'
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
