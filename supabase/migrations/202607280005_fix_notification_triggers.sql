-- Fix notification triggers to use real data instead of placeholders

-- Fix notify_partner_activity to use real event data for calendar events
create or replace function public.notify_partner_activity() returns trigger
language plpgsql security definer set search_path=''
as $$
declare 
  v_recipient uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_space uuid;
  v_actor uuid;
  v_event_name text;
  v_event_date date;
  v_event_type text;
begin
  v_actor := coalesce((to_jsonb(new)->>'creator_id')::uuid, (to_jsonb(new)->>'author_id')::uuid);
  v_space := (to_jsonb(new)->>'space_id')::uuid;
  select member.user_id into v_recipient from public.space_members member where member.space_id = v_space and member.active and member.user_id <> v_actor limit 1;
  if v_recipient is null then return new; end if;
  
  if tg_table_name = 'memory_entries' then
    v_type := 'memory_created';
    v_title := '新增回忆';
    v_body := '';
  elsif tg_table_name = 'mood_entries' then
    v_type := 'mood_created';
    v_title := '更新心情';
    v_body := new.body;
  elsif tg_table_name = 'calendar_events' then
    -- Use specific event data
    v_event_name := new.name;
    v_event_date := new.event_date;
    v_event_type := new.event_type;
    
    case v_event_type
      when 'anniversary' then v_title := '新增了一项纪念日';
      when 'birthday' then v_title := '新增了生日';
      when 'date' then v_title := '安排了一次约会';
      when 'travel' then v_title := '新增了一次旅行';
      when 'todo' then v_title := '新增了一个待办';
      else v_title := '新增了一项其他事件';
    end case;
    
    v_body := v_event_name;
    if v_event_date is not null then
      v_body := v_body || ' · ' || to_char(v_event_date, 'FMMonth FMDD日');
    end if;
    
    v_type := 'calendar_event_created';
  else
    return new;
  end if;
  
  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
  values(v_recipient, v_actor, v_type, new.id, v_title, v_body);
  
  return new;
end;
$$;

-- Fix notify_partner_journal to use real journal title
create or replace function public.notify_partner_journal() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_recipient uuid;
begin
  if new.entry_type <> 'today' then return new; end if;
  select m.user_id into v_recipient from public.space_members m where m.space_id = new.space_id and m.active and m.user_id <> new.author_id limit 1;
  if v_recipient is not null then 
    insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
    values(v_recipient, new.author_id, 'journal_created', new.id, '寄来一封信', new.title); 
  end if;
  return new;
end;
$$;

-- Fix notify_partner_profile_change to use specific types and real data
create or replace function public.notify_partner_profile_change(p_kind text) returns void
language plpgsql security definer set search_path=''
as $$
declare 
  v_actor uuid := auth.uid();
  v_space uuid;
  v_recipient uuid;
  v_body text;
  v_type public.notification_type;
  v_title text;
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

revoke execute on function public.notify_partner_profile_change(text) from public, anon;
grant execute on function public.notify_partner_profile_change(text) to authenticated;
