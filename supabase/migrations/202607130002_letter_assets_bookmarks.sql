begin;

alter table public.annotations
  add column block_id text,
  add constraint annotations_anchor_shape_check check (
    block_id is null
    or (
      block_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      and start_offset >= 0
      and end_offset > start_offset
      and char_length(quoted_text) between 1 and 1000
    )
  );

alter table public.letters
  add column deletion_token uuid,
  add column deletion_pending_at timestamptz,
  add constraint letters_deletion_marker_shape_check check (
    (deletion_token is null and deletion_pending_at is null)
    or (deletion_token is not null and deletion_pending_at is not null)
  );

drop policy if exists "authors can delete unfinished letters" on public.letters;
revoke delete on public.letters from public, anon, authenticated;

create function public.guard_letter_deletion_pending()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  letters_owner name;
begin
  select pg_catalog.pg_get_userbyid(table_class.relowner)
  into letters_owner
  from pg_catalog.pg_class as table_class
  where table_class.oid = 'public.letters'::regclass;

  if old.deletion_token is not null then
    raise exception using
      errcode = '55000',
      message = 'letter deletion is already pending';
  end if;

  if (
    new.deletion_token is distinct from old.deletion_token
    or new.deletion_pending_at is distinct from old.deletion_pending_at
  ) and current_user is distinct from letters_owner then
    raise exception using
      errcode = '42501',
      message = 'letter deletion marker is managed by a controlled function';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_letter_deletion_pending()
from public, anon, authenticated;

create trigger letters_deletion_guard
before update on public.letters
for each row execute function public.guard_letter_deletion_pending();

create table public.letter_assets (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid references public.letters(id) on delete set null,
  letter_key uuid not null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type = 'image/webp'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  sort_order integer not null default 0 check (sort_order >= 0),
  upload_status text not null default 'uploading'
    check (upload_status in ('uploading', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  constraint letter_assets_storage_path_check check (
    cardinality(storage.foldername(storage_path)) = 2
    and (storage.foldername(storage_path))[1] = owner_id::text
    and (storage.foldername(storage_path))[2] = letter_key::text
    and mime_type = 'image/webp'
    and lower(storage.filename(storage_path)) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  )
);

create function public.set_letter_asset_key()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.letter_id is null then
    raise exception using
      errcode = '23502',
      message = 'letter_id is required when creating an asset';
  end if;

  new.letter_key := new.letter_id;
  return new;
end;
$$;

revoke all on function public.set_letter_asset_key()
from public, anon, authenticated;

create trigger letter_assets_set_key
before insert on public.letter_assets
for each row execute function public.set_letter_asset_key();

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  letter_id uuid not null references public.letters(id) on delete cascade,
  kind text not null check (kind in ('letter', 'excerpt')),
  block_id text,
  start_offset integer,
  end_offset integer,
  quoted_text text,
  created_at timestamptz not null default now(),
  constraint bookmarks_anchor_shape_check check (
    (
      kind = 'letter'
      and block_id is null
      and start_offset is null
      and end_offset is null
      and quoted_text is null
    )
    or
    (
      kind = 'excerpt'
      and block_id is not null
      and block_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      and start_offset is not null
      and start_offset >= 0
      and end_offset is not null
      and end_offset > start_offset
      and end_offset <= 1000000
      and end_offset - start_offset <= 1000
      and quoted_text is not null
      and quoted_text ~ '[^[:space:]]'
      and char_length(quoted_text) between 1 and 1000
    )
  )
);

create index letter_assets_letter_id_idx
on public.letter_assets (letter_id);

create index letter_assets_owner_id_idx
on public.letter_assets (owner_id);

create index letter_assets_owner_letter_key_idx
on public.letter_assets (owner_id, letter_key);

create index bookmarks_owner_created_at_idx
on public.bookmarks (owner_id, created_at desc);

create unique index bookmarks_owner_letter_anchor_uidx
on public.bookmarks (
  owner_id,
  letter_id,
  kind,
  coalesce(block_id, ''),
  coalesce(start_offset, -1),
  coalesce(end_offset, -1)
);

alter table public.letter_assets enable row level security;
alter table public.bookmarks enable row level security;

create policy "members can read visible letter assets"
on public.letter_assets for select to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and (
    exists (
      select 1
      from public.letters as parent_letter
      where parent_letter.id = letter_assets.letter_id
        and (
          (
            letter_assets.upload_status = 'ready'
            and parent_letter.status = 'published'
          )
          or (
            letter_assets.owner_id = (select auth.uid())
            and parent_letter.author_id = (select auth.uid())
            and parent_letter.status in ('draft', 'scheduled')
          )
        )
    )
    or (
      letter_assets.owner_id = (select auth.uid())
      and letter_assets.upload_status = 'failed'
    )
  )
);

create policy "authors can create active letter assets"
on public.letter_assets for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and upload_status = 'uploading'
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and exists (
    select 1
    from public.letters as parent_letter
    where parent_letter.id = letter_assets.letter_id
      and parent_letter.author_id = (select auth.uid())
      and parent_letter.status in ('draft', 'scheduled')
      and parent_letter.deletion_token is null
  )
);

create policy "users can read own bookmarks"
on public.bookmarks for select to authenticated
using (
  owner_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
);

create policy "users can bookmark readable published letters"
on public.bookmarks for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and exists (
    select 1
    from public.letters as parent_letter
    where parent_letter.id = bookmarks.letter_id
      and parent_letter.status = 'published'
  )
);

create policy "users can delete own bookmarks"
on public.bookmarks for delete to authenticated
using (
  owner_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
);

revoke all on public.letter_assets, public.bookmarks from public, anon, authenticated;

grant select on public.letter_assets to authenticated;
grant insert (
  letter_id,
  owner_id,
  storage_path,
  mime_type,
  width,
  height,
  size_bytes,
  sort_order
) on public.letter_assets to authenticated;

grant select, delete on public.bookmarks to authenticated;
grant insert (
  owner_id,
  letter_id,
  kind,
  block_id,
  start_offset,
  end_offset,
  quoted_text
) on public.bookmarks to authenticated;

drop policy if exists "members can annotate published letters" on public.annotations;
create policy "members can annotate published letters"
on public.annotations for insert to authenticated
with check (
  author_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and block_id is not null
  and block_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  and start_offset >= 0
  and end_offset > start_offset
  and end_offset <= 1000000
  and end_offset - start_offset <= 1000
  and quoted_text ~ '[^[:space:]]'
  and char_length(quoted_text) between 1 and 1000
  and comment ~ '[^[:space:]]'
  and char_length(comment) between 1 and 1000
  and exists (
    select 1
    from public.letters as parent_letter
    where parent_letter.id = annotations.letter_id
      and parent_letter.status = 'published'
  )
);

drop policy if exists "members can update own published letter annotations" on public.annotations;
revoke insert, update on public.annotations from authenticated;
revoke update (
  block_id,
  quoted_text,
  start_offset,
  end_offset,
  comment,
  updated_at
) on public.annotations from authenticated;
grant insert (
  letter_id,
  author_id,
  block_id,
  quoted_text,
  start_offset,
  end_offset,
  comment
) on public.annotations to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'letter-images',
  'letter-images',
  false,
  5242880,
  array['image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.fail_letter_image_upload(
  p_asset_id uuid,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  caller_id uuid := auth.uid();
  asset_row public.letter_assets%rowtype;
begin
  if caller_id is null or not coalesce(
    ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true',
    false
  ) then
    return false;
  end if;

  select asset.*
  into asset_row
  from public.letter_assets as asset
  where asset.id = p_asset_id
    and asset.owner_id = caller_id
    and asset.storage_path = p_storage_path
  for update;

  if not found or asset_row.upload_status not in ('uploading', 'failed') then
    return false;
  end if;

  if asset_row.upload_status = 'failed' then
    return true;
  end if;

  update public.letter_assets
  set upload_status = 'failed'
  where id = asset_row.id
    and owner_id = caller_id
    and storage_path = asset_row.storage_path
    and upload_status = 'uploading';

  return found;
end;
$$;

revoke all on function public.fail_letter_image_upload(uuid, text)
from public, anon, authenticated;
grant execute on function public.fail_letter_image_upload(uuid, text)
to authenticated;

create function public.complete_letter_image_upload(
  p_asset_id uuid,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  caller_id uuid := auth.uid();
  asset_row public.letter_assets%rowtype;
  object_row storage.objects%rowtype;
  object_size_text text;
begin
  if caller_id is null or not coalesce(
    ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true',
    false
  ) then
    return false;
  end if;

  select asset.*
  into asset_row
  from public.letter_assets as asset
  where asset.id = p_asset_id
    and asset.owner_id = caller_id
    and asset.storage_path = p_storage_path
  for update;

  if not found or asset_row.upload_status not in ('uploading', 'ready') then
    return false;
  end if;

  if not exists (
    select 1
    from public.letters as parent_letter
    where parent_letter.id = asset_row.letter_id
      and parent_letter.author_id = caller_id
      and (
        (
          asset_row.upload_status = 'ready'
          and parent_letter.status = 'published'
        )
        or (
          parent_letter.status in ('draft', 'scheduled')
          and parent_letter.deletion_token is null
        )
      )
  ) then
    return false;
  end if;

  select stored_object.*
  into object_row
  from storage.objects as stored_object
  where stored_object.bucket_id = 'letter-images'
    and stored_object.name = asset_row.storage_path
    and stored_object.owner_id = caller_id::text;

  if not found then
    return false;
  end if;

  object_size_text := object_row.metadata ->> 'size';
  if lower(coalesce(object_row.metadata ->> 'mimetype', '')) <> asset_row.mime_type
    or object_size_text is null
    or object_size_text !~ '^[0-9]+$'
  then
    return false;
  end if;

  if object_size_text::numeric <> asset_row.size_bytes then
    return false;
  end if;

  if asset_row.upload_status = 'ready' then
    return true;
  end if;

  update public.letter_assets
  set upload_status = 'ready'
  where id = asset_row.id
    and owner_id = caller_id
    and storage_path = asset_row.storage_path
    and upload_status = 'uploading';

  return found;
end;
$$;

revoke all on function public.complete_letter_image_upload(uuid, text)
from public, anon, authenticated;
grant execute on function public.complete_letter_image_upload(uuid, text)
to authenticated;

create function public.prepare_private_letter_deletion(
  p_letter_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  caller_id uuid := auth.uid();
  letter_row public.letters%rowtype;
  deletion_id uuid;
  storage_paths text[];
begin
  if caller_id is null or not coalesce(
    ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true',
    false
  ) then
    return null;
  end if;

  select parent_letter.*
  into letter_row
  from public.letters as parent_letter
  where parent_letter.id = p_letter_id
    and parent_letter.author_id = caller_id
    and parent_letter.status in ('draft', 'scheduled')
  for update;

  if not found or (
    letter_row.deletion_token is null
    and letter_row.version <> p_expected_version
  ) then
    return null;
  end if;

  if letter_row.deletion_token is null then
    deletion_id := gen_random_uuid();

    update public.letters
    set
      deletion_token = deletion_id,
      deletion_pending_at = now()
    where id = letter_row.id
      and author_id = caller_id
      and status in ('draft', 'scheduled')
      and version = p_expected_version
      and deletion_token is null;

    if not found then
      return null;
    end if;
  else
    deletion_id := letter_row.deletion_token;
  end if;

  update public.letter_assets as asset
  set upload_status = 'failed'
  where asset.letter_id = letter_row.id
    and asset.owner_id = caller_id
    and asset.upload_status in ('uploading', 'ready');

  select coalesce(
    array_agg(asset.storage_path order by asset.storage_path),
    array[]::text[]
  )
  into storage_paths
  from public.letter_assets as asset
  where asset.letter_id = letter_row.id
    and asset.owner_id = caller_id;

  return jsonb_build_object(
    'token', deletion_id::text,
    'paths', to_jsonb(storage_paths)
  );
end;
$$;

revoke all on function public.prepare_private_letter_deletion(uuid, integer)
from public, anon, authenticated;
grant execute on function public.prepare_private_letter_deletion(uuid, integer)
to authenticated;

create function public.finalize_private_letter_deletion(
  p_letter_id uuid,
  p_deletion_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  caller_id uuid := auth.uid();
  letter_row public.letters%rowtype;
begin
  if caller_id is null or not coalesce(
    ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true',
    false
  ) then
    return false;
  end if;

  select parent_letter.*
  into letter_row
  from public.letters as parent_letter
  where parent_letter.id = p_letter_id
    and parent_letter.author_id = caller_id
    and parent_letter.status in ('draft', 'scheduled')
    and parent_letter.deletion_token = p_deletion_token
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.letter_assets as asset
    where asset.letter_id = letter_row.id
      and asset.owner_id = caller_id
      and asset.upload_status <> 'failed'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.letter_assets as asset
    join storage.objects as stored_object
      on stored_object.bucket_id = 'letter-images'
      and stored_object.name = asset.storage_path
      and stored_object.owner_id = caller_id::text
    where asset.letter_id = letter_row.id
      and asset.owner_id = caller_id
  ) then
    return false;
  end if;

  delete from public.letters
  where id = letter_row.id
    and author_id = caller_id
    and status in ('draft', 'scheduled')
    and letter_row.deletion_token = p_deletion_token
    and deletion_token = p_deletion_token;

  return found;
end;
$$;

revoke all on function public.finalize_private_letter_deletion(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.finalize_private_letter_deletion(uuid, uuid)
to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.can_read_letter_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
    and exists (
      select 1
      from public.letter_assets as asset
      left join public.letters as parent_letter
        on parent_letter.id = asset.letter_id
      where asset.storage_path = object_name
        and cardinality(storage.foldername(asset.storage_path)) = 2
        and (storage.foldername(asset.storage_path))[1] = asset.owner_id::text
        and (storage.foldername(asset.storage_path))[2] = asset.letter_key::text
        and (
          (
            asset.upload_status = 'ready'
            and asset.owner_id = parent_letter.author_id
            and parent_letter.status = 'published'
          )
          or (
            asset.owner_id = (select auth.uid())
            and parent_letter.author_id = (select auth.uid())
            and parent_letter.status in ('draft', 'scheduled')
          )
          or (
            asset.owner_id = (select auth.uid())
            and asset.upload_status = 'failed'
          )
        )
    ),
    false
  );
$$;

revoke all on function private.can_read_letter_image(text) from public, anon, authenticated;
grant execute on function private.can_read_letter_image(text) to authenticated;

create function private.can_upload_letter_image(object_name text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  allowed boolean := false;
begin
  if not coalesce(
    ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true',
    false
  ) then
    return false;
  end if;

  select true
  into allowed
  from public.letter_assets as asset
  join public.letters as parent_letter on parent_letter.id = asset.letter_id
  where asset.storage_path = object_name
    and asset.owner_id = (select auth.uid())
    and asset.upload_status = 'uploading'
    and parent_letter.id::text = (storage.foldername(object_name))[2]
    and parent_letter.author_id = (select auth.uid())
    and parent_letter.status in ('draft', 'scheduled')
    and parent_letter.deletion_token is null
  for share of parent_letter, asset;

  return coalesce(allowed, false);
end;
$$;

revoke all on function private.can_upload_letter_image(text)
from public, anon, authenticated;
grant execute on function private.can_upload_letter_image(text)
to authenticated;

create policy "members can read visible letter images"
on storage.objects for select to authenticated
using (
  bucket_id = 'letter-images'
  and private.can_read_letter_image(name)
);

create policy "authors can upload active letter images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'letter-images'
  and owner_id = (select auth.uid())::text
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and cardinality(storage.foldername(name)) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.filename(name)) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and private.can_upload_letter_image(name)
);

create policy "authors can update active letter images"
on storage.objects for update to authenticated
using (
  bucket_id = 'letter-images'
  and owner_id = (select auth.uid())::text
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and cardinality(storage.foldername(name)) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.filename(name)) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.letter_assets as asset
    join public.letters as parent_letter on parent_letter.id = asset.letter_id
    where asset.storage_path = name
      and asset.owner_id = (select auth.uid())
      and asset.upload_status in ('uploading', 'failed')
      and parent_letter.id::text = (storage.foldername(name))[2]
      and parent_letter.author_id = (select auth.uid())
      and parent_letter.status in ('draft', 'scheduled')
      and parent_letter.deletion_token is null
  )
)
with check (
  bucket_id = 'letter-images'
  and owner_id = (select auth.uid())::text
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and cardinality(storage.foldername(name)) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.filename(name)) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.letter_assets as asset
    join public.letters as parent_letter on parent_letter.id = asset.letter_id
    where asset.storage_path = name
      and asset.owner_id = (select auth.uid())
      and asset.upload_status in ('uploading', 'failed')
      and parent_letter.id::text = (storage.foldername(name))[2]
      and parent_letter.author_id = (select auth.uid())
      and parent_letter.status in ('draft', 'scheduled')
      and parent_letter.deletion_token is null
  )
);

create policy "authors can delete active letter images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'letter-images'
  and owner_id = (select auth.uid())::text
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and cardinality(storage.foldername(name)) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.filename(name)) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.letter_assets as asset
    where asset.storage_path = name
      and asset.owner_id = (select auth.uid())
      and asset.letter_key::text = (storage.foldername(name))[2]
      and asset.upload_status = 'failed'
  )
);

commit;
