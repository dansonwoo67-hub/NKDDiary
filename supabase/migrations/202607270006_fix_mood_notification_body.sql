-- 修复心情通知的 body 字段，使其包含实际的心情内容
-- 而不是固定的 "对方更新了心情" 文字

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
begin
  v_actor := coalesce((to_jsonb(new)->>'creator_id')::uuid, (to_jsonb(new)->>'author_id')::uuid);
  v_space := (to_jsonb(new)->>'space_id')::uuid;
  
  select member.user_id into v_recipient 
  from public.space_members member 
  where member.space_id = v_space 
    and member.active 
    and member.user_id <> v_actor 
  limit 1;
  
  if v_recipient is null then return new; end if;
  
  if tg_table_name = 'memory_entries' then
    v_type := 'memory_created';
    v_title := '新增回忆';
    v_body := new.title;
  elsif tg_table_name = 'mood_entries' then
    v_type := 'mood_created';
    v_title := '更新了心情';
    v_body := coalesce(new.body, '');
    -- 如果有表情，添加到通知中
    if new.emoji is not null and btrim(new.emoji) <> '' then
      v_body := new.emoji || ' ' || v_body;
    end if;
  else
    v_type := 'calendar_event';
    v_title := '新增日历事件';
    v_body := new.name;
  end if;
  
  insert into public.notifications(recipient_id, actor_id, type, source_id, title, body) 
  values (v_recipient, v_actor, v_type, new.id, v_title, v_body);
  
  return new;
end;
$$;

-- 重新创建触发器以确保使用最新的函数定义
drop trigger if exists memory_partner_activity on public.memory_entries;
create trigger memory_partner_activity
  after insert on public.memory_entries
  for each row
  execute function public.notify_partner_activity();

drop trigger if exists mood_partner_activity on public.mood_entries;
create trigger mood_partner_activity
  after insert on public.mood_entries
  for each row
  execute function public.notify_partner_activity();

drop trigger if exists calendar_partner_activity on public.calendar_events;
create trigger calendar_partner_activity
  after insert on public.calendar_events
  for each row
  execute function public.notify_partner_activity();
