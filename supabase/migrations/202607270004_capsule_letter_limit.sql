-- 胶囊信额度规则
-- 1. 新增状态字段和额度统计字段
-- 2. 实现每日胶囊信额度检查
-- 3. 修改 seal_future_diary 加入额度校验

-- 1. 添加状态枚举和新字段（如果不存在）
do $$
begin
  if not exists (select 1 from pg_type where typname = 'journal_entry_status') then
    create type public.journal_entry_status as enum ('draft', 'scheduled', 'sent', 'cancelled');
  end if;
end $$;

alter table public.journal_entries
  add column if not exists status public.journal_entry_status default 'draft',
  add column if not exists scheduled_created_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- 更新现有记录的状态
update public.journal_entries
set status = case
  when entry_type = 'today' then 'sent'::public.journal_entry_status
  when opened_at is not null then 'sent'::public.journal_entry_status
  when sealed_at is not null then 'scheduled'::public.journal_entry_status
  else 'draft'::public.journal_entry_status
end
where status is null;

-- 2. 创建胶囊信额度检查函数
create or replace function public.get_capsule_letter_limit_status()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_count integer;
  v_limit integer := 1;
  v_reset_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 统计今日已封存的胶囊信数量
  select count(*) into v_count
  from public.journal_entries
  where author_id = v_user_id
    and entry_type = 'future'
    and status in ('scheduled', 'sent', 'cancelled')
    and (scheduled_created_at at time zone 'Asia/Shanghai')::date = v_local_date;

  -- 计算恢复时间（第二天00:00上海时间）
  v_reset_at := (v_local_date + interval '1 day')::timestamptz at time zone 'Asia/Shanghai';

  return json_build_object(
    'used_today', v_count,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_count, 0),
    'is_limit_reached', v_count >= v_limit,
    'reset_at', v_reset_at
  );
end;
$$;

-- 3. 创建普通信额度检查函数（普通信无每日限制）
create or replace function public.get_normal_letter_limit_status()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_count integer;
  v_limit integer := 999; -- 普通信无每日限制
  v_reset_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 统计今日已发布的普通信数量（仅供统计，不限额度）
  select count(*) into v_count
  from public.journal_entries
  where author_id = v_user_id
    and entry_type = 'today'
    and status = 'sent'
    and (created_local_date) = v_local_date;

  -- 计算恢复时间（第二天00:00上海时间）
  v_reset_at := (v_local_date + interval '1 day')::timestamptz at time zone 'Asia/Shanghai';

  return json_build_object(
    'used_today', v_count,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_count, 0),
    'is_limit_reached', false, -- 普通信永远不会达到额度限制
    'reset_at', v_reset_at
  );
end;
$$;

-- 4. 修改 seal_future_diary 加入额度检查
create or replace function public.seal_future_diary(
  p_space_id uuid,
  p_title text,
  p_content text,
  p_recipient_id uuid,
  p_open_at timestamptz,
  p_image_path text default null
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
  v_capsule_count integer;
begin
  if v_user_id is null or not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'active space membership required' using errcode = '42501';
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

  -- 检查胶囊信每日额度
  select count(*) into v_capsule_count
  from public.journal_entries
  where author_id = v_user_id
    and entry_type = 'future'
    and status in ('scheduled', 'sent', 'cancelled')
    and (scheduled_created_at at time zone 'Asia/Shanghai')::date = v_local_date;

  if v_capsule_count >= 1 then
    raise exception 'DAILY_CAPSULE_LETTER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into public.journal_entries (
    space_id, author_id, recipient_id, entry_type, title, content, image_path,
    created_local_date, published_at, locked_at, sealed_at, open_at,
    status, scheduled_created_at
  ) values (
    p_space_id, v_user_id, p_recipient_id, 'future', btrim(p_title), btrim(p_content),
    p_image_path, v_local_date, v_now, v_now, v_now, p_open_at,
    'scheduled', v_now
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

-- 5. 创建更新胶囊信函数（编辑待发送的胶囊信）
create or replace function public.update_future_diary(
  p_entry_id uuid,
  p_title text,
  p_content text,
  p_open_at timestamptz,
  p_image_path text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_author_id uuid;
  v_status public.journal_entry_status;
  v_entry public.journal_entries;
begin
  select journal.space_id, journal.author_id, journal.status
  into v_space_id, v_author_id, v_status
  from public.journal_entries as journal
  where id = p_entry_id
    and entry_type = 'future'
  for update;

  if not found
    or v_author_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;

  -- 只允许编辑状态为 scheduled 的胶囊信
  if v_status <> 'scheduled' then
    raise exception 'journal entry cannot be modified' using errcode = '55000';
  end if;

  update public.journal_entries
  set title = btrim(p_title),
      content = btrim(p_content),
      image_path = p_image_path,
      open_at = p_open_at,
      updated_at = now()
      -- scheduled_created_at 不更新，保持首次封存时间用于额度统计
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

-- 6. 创建取消胶囊信函数
create or replace function public.cancel_future_diary(p_entry_id uuid)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_author_id uuid;
  v_status public.journal_entry_status;
  v_entry public.journal_entries;
begin
  select journal.space_id, journal.author_id, journal.status
  into v_space_id, v_author_id, v_status
  from public.journal_entries as journal
  where id = p_entry_id
    and entry_type = 'future'
  for update;

  if not found
    or v_author_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;

  -- 只允许取消状态为 scheduled 的胶囊信
  if v_status <> 'scheduled' then
    raise exception 'journal entry cannot be cancelled' using errcode = '55000';
  end if;

  update public.journal_entries
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = p_entry_id
  returning * into v_entry;

  return v_entry;
end;
$$;

-- 7. 创建胶囊信自动发送函数
create or replace function public.send_scheduled_future_diaries()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_entry record;
begin
  -- 查找所有到期但尚未发送的胶囊信
  for v_entry in select id, space_id, author_id, recipient_id, title, content
    from public.journal_entries
    where entry_type = 'future'
      and status = 'scheduled'
      and open_at <= v_now
      and cancelled_at is null
  loop
    begin
      -- 将状态改为 sent
      update public.journal_entries
      set status = 'sent',
          published_at = v_now,
          updated_at = v_now
      where id = v_entry.id;
      
      -- 创建新信通知给收件人
      insert into public.notifications(
        recipient_id, type, source_id, title, body
      )
      values (
        v_entry.recipient_id,
        'letter_created'::text::public.notification_type,
        v_entry.id,
        '收到一封新的胶囊信',
        '时间胶囊已经送达，快来看看吧。'
      )
      on conflict (recipient_id, type, source_id)
      do nothing;
      
    exception
      when others then
        -- 记录错误但继续处理其他信件
        raise notice 'Failed to send future diary %: %', v_entry.id, SQLERRM;
    end;
  end loop;
end;
$$;

-- 8. 创建定时任务（每5分钟检查一次）
-- 注意：需要先启用 pg_cron 扩展
-- select cron.schedule('send-scheduled-capsule-letters', '*/5 * * * *', 'select public.send_scheduled_future_diaries();');

-- 9. 授予权限
revoke execute on function public.get_capsule_letter_limit_status() from public, anon, authenticated;
revoke execute on function public.get_normal_letter_limit_status() from public, anon, authenticated;
revoke execute on function public.update_future_diary(uuid, text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.cancel_future_diary(uuid) from public, anon, authenticated;
revoke execute on function public.send_scheduled_future_diaries() from public, anon, authenticated;

grant execute on function public.get_capsule_letter_limit_status() to authenticated;
grant execute on function public.get_normal_letter_limit_status() to authenticated;
grant execute on function public.update_future_diary(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.cancel_future_diary(uuid) to authenticated;
grant execute on function public.send_scheduled_future_diaries() to authenticated;
