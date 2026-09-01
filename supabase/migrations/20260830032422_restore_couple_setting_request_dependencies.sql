-- Restore only the v1.0.0 dependencies required by the existing couple
-- settings request lifecycle RPC migrations that follow this file.
--
-- Production preflight on 2026-08-31 confirmed every created object below is
-- absent. Existing shared tables, RLS policies, functions, and data are not
-- replaced. The spaces.theme column uses the baseline default for existing
-- rows; no explicit data update or backfill is performed.
begin;

do $preflight$
declare
  v_notification_type_kind "char";
  v_helper_default_count integer;
begin
  if to_regtype('public.setting_request_type') is not null then
    raise exception 'preflight: public.setting_request_type already exists';
  end if;

  if to_regtype('public.setting_request_status') is not null then
    raise exception 'preflight: public.setting_request_status already exists';
  end if;

  if to_regclass('public.couple_setting_requests') is not null then
    raise exception 'preflight: public.couple_setting_requests already exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'spaces'
      and column_name = 'theme'
  ) then
    raise exception 'preflight: public.spaces.theme already exists';
  end if;

  if exists (
    select 1
    from pg_class as object
    join pg_namespace as namespace on namespace.oid = object.relnamespace
    where namespace.nspname = 'public'
      and object.relname = 'couple_setting_requests_unique_pending'
  ) then
    raise exception 'preflight: public.couple_setting_requests_unique_pending already exists';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'create_couple_setting_request',
        'approve_couple_setting_request',
        'reject_couple_setting_request',
        'cancel_couple_setting_request'
      )
  ) then
    raise exception 'preflight: a couple setting request lifecycle RPC already exists';
  end if;

  select type.typtype
  into v_notification_type_kind
  from pg_type as type
  join pg_namespace as namespace on namespace.oid = type.typnamespace
  where namespace.nspname = 'public'
    and type.typname = 'notification_type';

  if not found or v_notification_type_kind <> 'e' then
    raise exception 'preflight: public.notification_type is missing or is not an enum';
  end if;

  if to_regclass('public.spaces') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.space_members') is null
    or to_regclass('public.notifications') is null then
    raise exception 'preflight: required shared tables are missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'space_members'
      and column_name = 'space_id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'space_members'
      and column_name = 'user_id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'space_members'
      and column_name = 'active'
      and data_type = 'boolean'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'display_name'
      and data_type = 'text'
  ) then
    raise exception 'preflight: required membership/profile columns are incompatible';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'recipient_id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'actor_id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'type'
      and udt_schema = 'public'
      and udt_name = 'notification_type'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'source_id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'title'
      and data_type = 'text'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'body'
      and data_type = 'text'
  ) then
    raise exception 'preflight: required notification columns are incompatible';
  end if;

  select procedure.pronargdefaults
  into v_helper_default_count
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'is_active_space_member'
    and pg_get_function_identity_arguments(procedure.oid) =
      'requested_space_id uuid, requested_user_id uuid';

  if not found or v_helper_default_count <> 1 then
    raise exception 'preflight: public.is_active_space_member(uuid, uuid default auth.uid()) is missing';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'service_role')
    or not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'preflight: required Supabase roles are missing';
  end if;
end;
$preflight$;

alter table public.spaces
add column theme text not null default 'cream';

create type public.setting_request_type as enum (
  'space_name',
  'relationship_started_on',
  'theme'
);

create type public.setting_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table public.couple_setting_requests (
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

create unique index couple_setting_requests_unique_pending
on public.couple_setting_requests(space_id, setting_type)
where status = 'pending';

alter type public.notification_type
add value if not exists 'space_setting_request';

alter type public.notification_type
add value if not exists 'space_setting_response';

alter table public.couple_setting_requests enable row level security;

create policy "active members can read setting requests in their space"
on public.couple_setting_requests for select to authenticated
using (public.is_active_space_member(space_id));

create policy "active members can create setting requests"
on public.couple_setting_requests for insert to authenticated
with check (
  public.is_active_space_member(space_id)
  and requester_id = auth.uid()
);

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

revoke all privileges on table public.couple_setting_requests
from public, anon, authenticated;

-- Current application reads this table directly, but performs every mutation
-- through the SECURITY DEFINER lifecycle RPCs. Keep direct writes unavailable
-- so callers cannot bypass status-transition and notification enforcement.
grant select on table public.couple_setting_requests to authenticated;

grant all privileges on table public.couple_setting_requests
to service_role;

commit;
