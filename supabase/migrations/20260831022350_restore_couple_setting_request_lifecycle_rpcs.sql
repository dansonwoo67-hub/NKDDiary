-- Restore the remaining v1.0.0 couple settings request lifecycle RPCs.
-- The create RPC is restored by the immediately preceding migration.
begin;

do $preflight$
begin
  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'approve_couple_setting_request',
        'reject_couple_setting_request',
        'cancel_couple_setting_request'
      )
  ) then
    raise exception 'preflight: a response lifecycle RPC already exists';
  end if;

  if to_regprocedure(
    'public.create_couple_setting_request(public.setting_request_type,text,text)'
  ) is null then
    raise exception 'preflight: create_couple_setting_request dependency is missing';
  end if;
end;
$preflight$;

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

  if not public.is_active_space_member(v_request.space_id, v_actor) then
    raise exception 'not a space member' using errcode = '42501';
  end if;

  update public.couple_setting_requests
  set status = 'approved', responded_at = now(), responder_id = v_actor
  where id = p_request_id
  returning * into v_request;

  case v_request.setting_type
    when 'space_name' then
      update public.spaces
      set name = v_request.proposed_value
      where id = v_request.space_id;
    when 'relationship_started_on' then
      update public.profiles
      set relationship_started_on = v_request.proposed_value::date
      where id in (
        select user_id
        from public.space_members
        where space_id = v_request.space_id and active
      );
    when 'theme' then
      update public.spaces
      set theme = v_request.proposed_value
      where id = v_request.space_id;
  end case;

  select display_name into v_partner_name
  from public.profiles
  where id = v_actor;

  insert into public.notifications(
    recipient_id, actor_id, type, source_id, title, body
  ) values (
    v_request.requester_id,
    v_actor,
    'space_setting_response',
    p_request_id,
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

  select display_name into v_partner_name
  from public.profiles
  where id = v_actor;

  insert into public.notifications(
    recipient_id, actor_id, type, source_id, title, body
  ) values (
    v_request.requester_id,
    v_actor,
    'space_setting_response',
    p_request_id,
    v_partner_name || ' 暂不修改',
    '对方觉得现在这样就挺好'
  );

  return v_request;
end;
$$;

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
  where id = p_request_id
    and status = 'pending'
    and requester_id = v_actor
  for update;

  if not found then
    raise exception 'request not found or not cancellable' using errcode = 'P0002';
  end if;

  update public.couple_setting_requests
  set status = 'cancelled', cancelled_at = now()
  where id = p_request_id
  returning * into v_request;

  delete from public.notifications
  where source_id = p_request_id
    and type = 'space_setting_request'
    and is_read = false;

  return v_request;
end;
$$;

revoke execute on function public.approve_couple_setting_request(uuid)
from public, anon;

revoke execute on function public.reject_couple_setting_request(uuid)
from public, anon;

revoke execute on function public.cancel_couple_setting_request(uuid)
from public, anon;

grant execute on function public.approve_couple_setting_request(uuid)
to authenticated, service_role;

grant execute on function public.reject_couple_setting_request(uuid)
to authenticated, service_role;

grant execute on function public.cancel_couple_setting_request(uuid)
to authenticated, service_role;

commit;
