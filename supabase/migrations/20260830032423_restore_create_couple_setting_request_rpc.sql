-- Restore the v1.0.0 baseline RPC contract missing from Production metadata.
-- This migration is additive: it changes no tables, RLS policies, or data.
begin;

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

  select space_id into v_space_id
  from public.space_members
  where user_id = v_actor and active;

  if not found then
    raise exception 'not a space member' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.couple_setting_requests
    where space_id = v_space_id
      and setting_type = p_setting_type
      and status = 'pending'
  ) then
    raise exception 'pending request already exists' using errcode = '22000';
  end if;

  insert into public.couple_setting_requests(
    space_id, requester_id, setting_type, current_value, proposed_value
  ) values (
    v_space_id, v_actor, p_setting_type, p_current_value, p_proposed_value
  ) returning * into v_request;

  select user_id into v_partner_id
  from public.space_members
  where space_id = v_space_id
    and active
    and user_id <> v_actor;

  if v_partner_id is not null then
    select display_name into v_partner_name
    from public.profiles
    where id = v_actor;

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

revoke execute on function public.create_couple_setting_request(
  public.setting_request_type, text, text
) from public, anon;

grant execute on function public.create_couple_setting_request(
  public.setting_request_type, text, text
) to authenticated, service_role;

commit;
