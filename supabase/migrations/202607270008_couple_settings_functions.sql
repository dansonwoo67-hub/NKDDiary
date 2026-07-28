-- Backend functions for couple settings with mutual confirmation

begin;

-- 1. Create setting request function
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

-- 2. Approve setting request function
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

-- 3. Reject setting request function
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

-- 4. Cancel setting request function
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

-- 5. Update partner nickname function
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
