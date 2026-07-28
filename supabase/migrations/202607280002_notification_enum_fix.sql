-- Add missing notification types to enum
alter type public.notification_type add value if not exists 'profile_nickname_updated';
alter type public.notification_type add value if not exists 'profile_avatar_updated';
alter type public.notification_type add value if not exists 'calendar_event_created';
alter type public.notification_type add value if not exists 'calendar_event_updated';
alter type public.notification_type add value if not exists 'mood_updated';
alter type public.notification_type add value if not exists 'memory_updated';

-- Update notify_partner_profile_change to use specific enum types
create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare 
  v_actor uuid := auth.uid();
  v_space uuid;
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_display_name text;
begin
  v_space := public.resolve_single_active_space(v_actor); 
  if v_space is null then return; end if;
  
  select m.user_id into v_recipient 
  from public.space_members m 
  where m.space_id = v_space and m.active and m.user_id <> v_actor 
  limit 1;
  if v_recipient is null then return; end if;

  select p.display_name into v_display_name 
  from public.profiles p 
  where p.id = v_actor;

  case p_kind
    when 'avatar' then
      v_type := 'profile_avatar_updated';
      v_title := '更换了头像';
      v_body := '';
    when 'name' then
      v_type := 'profile_nickname_updated';
      v_title := '更新了昵称';
      -- Body contains ONLY the new nickname value for frontend formatting
      v_body := coalesce(v_display_name, '');
    else
      v_type := 'profile_updated';
      v_title := '更新了资料';
      v_body := '';
  end case;

  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
  values(v_recipient, v_actor, v_type, v_actor, v_title, v_body);
end;
$$;

-- Create function for creating calendar event notifications with proper enum types
create or replace function public.create_calendar_event_notification(
  p_event_id uuid,
  p_actor_id uuid,
  p_is_update boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_space_id uuid;
  v_recipient_id uuid;
  v_event record;
  v_notification_type public.notification_type;
  v_title text;
  v_body text;
begin
  if p_actor_id is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  
  v_space_id := public.resolve_single_active_space(p_actor_id);

  select event.id, event.name, event.creator_id, event.space_id, 
         event.event_date, event.end_date, event.recurrence, 
         event.event_type, event.description
  into v_event
  from public.calendar_events as event
  where event.id = p_event_id
    and event.space_id = v_space_id;
    
  if not found then
    raise exception 'calendar event not found' using errcode = '404';
  end if;

  -- Build title based on event_type and action
  v_notification_type := case when p_is_update then 'calendar_event_updated' else 'calendar_event_created' end;
  
  case v_event.event_type
    when 'anniversary' then
      v_title := case when p_is_update then '修改了纪念日' else '新增了一项纪念日' end;
    when 'birthday' then
      v_title := case when p_is_update then '更新了生日' else '新增了生日' end;
    when 'date' then
      v_title := case when p_is_update then '更新了约会安排' else '安排了一次约会' end;
    when 'travel' then
      v_title := case when p_is_update then '调整了旅行计划' else '新增了一次旅行' end;
    when 'todo' then
      v_title := case when p_is_update then '更新了待办' else '新增了一个待办' end;
    else
      v_title := case when p_is_update then '修改了事件' else '新增了一项其他事件' end;
  end case;

  -- Build body with event details
  v_body := v_event.name;
  if v_event.event_date is not null then
    v_body := v_body || ' · ' || to_char(v_event.event_date, 'FMMonth FMDD日');
  end if;

  -- Insert notification for partner only
  select m.user_id into v_recipient_id
  from public.space_members m
  where m.space_id = v_space_id and m.active and m.user_id <> p_actor_id
  limit 1;
  
  if v_recipient_id is not null then
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body)
    values (v_recipient_id, p_actor_id, v_notification_type, v_event.id, v_title, v_body);
  end if;
end;
$$;

revoke execute on function public.create_calendar_event_notification(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_calendar_event_notification(uuid, uuid, boolean) to authenticated;

-- Update create_space_calendar_event_v2 to trigger notification immediately
create or replace function public.create_space_calendar_event_v2(
  p_space_id uuid,
  p_name text,
  p_event_date date,
  p_end_date date,
  p_event_type text,
  p_recurrence public.recurrence_type,
  p_is_important boolean,
  p_description text,
  p_icon text,
  p_color text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'calendar space access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40
     or p_event_type not in ('date', 'anniversary', 'birthday', 'travel', 'todo', 'other')
     or p_recurrence not in ('none', 'monthly', 'yearly')
     or p_color not in ('rose', 'gold', 'blue', 'green', 'purple')
     or char_length(coalesce(p_description, '')) > 1000
     or (p_end_date is not null and p_end_date < p_event_date) then
    raise exception 'invalid calendar event' using errcode = '22023';
  end if;

  insert into public.calendar_events(
    space_id, creator_id, name, event_date, end_date, event_type,
    recurrence, is_important, description, icon, color
  ) values (
    p_space_id, v_actor, btrim(p_name), p_event_date, p_end_date, p_event_type,
    p_recurrence, coalesce(p_is_important, false), btrim(coalesce(p_description, '')),
    p_icon, p_color
  )
  returning id into v_id;
  
  -- Trigger notification immediately for the partner
  perform public.create_calendar_event_notification(v_id, v_actor, false);
  
  return v_id;
end;
$$;

revoke execute on function public.create_space_calendar_event_v2(
  uuid, text, date, date, text, public.recurrence_type, boolean, text, text, text
) from public, anon;
grant execute on function public.create_space_calendar_event_v2(
  uuid, text, date, date, text, public.recurrence_type, boolean, text, text, text
) to authenticated;

-- Create function for updating calendar event notifications
create or replace function public.update_calendar_event_notification(
  p_event_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  
  perform public.create_calendar_event_notification(p_event_id, v_actor, true);
end;
$$;

revoke execute on function public.update_calendar_event_notification(uuid) from public, anon;
grant execute on function public.update_calendar_event_notification(uuid) to authenticated;
