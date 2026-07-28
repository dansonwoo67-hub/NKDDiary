-- 诊断并修复收信箱/已寄出数量不匹配的问题
-- 运行此 SQL 检查数据库中的正式信件数据

-- ============================================================
-- 1. 诊断查询：查看所有正式信件的 author_id 和 recipient_id
-- ============================================================
-- 请在 Supabase SQL Editor 中运行以下查询：

/*
select
  id,
  author_id,
  recipient_id,
  entry_type,
  published_at,
  created_at,
  status,
  deleted_at,
  withdrawn_at,
  left(plain_text, 30) as text_preview
from public.journal_entries
where published_at is not null
  and recipient_id is not null
order by published_at desc;
*/

-- ============================================================
-- 2. 检查两个用户的空间成员关系
-- ============================================================

/*
select
  sm.space_id,
  sm.user_id,
  sm.active,
  p.display_name
from public.space_members sm
join public.profiles p on p.id = sm.user_id
where sm.active = true
order by sm.space_id;
*/

-- ============================================================
-- 3. 检查是否有 author_id = recipient_id 的错误数据
--    （自己写给自己的信，不应该存在）
-- ============================================================

/*
select id, author_id, recipient_id, left(plain_text, 30) as text_preview
from public.journal_entries
where author_id = recipient_id
  and published_at is not null;
*/

-- ============================================================
-- 4. 检查是否有 recipient_id 为空但应该是正式信的数据
-- ============================================================

/*
select id, author_id, recipient_id, entry_type, left(plain_text, 30) as text_preview
from public.journal_entries
where recipient_id is null
  and published_at is not null
  and entry_type = 'today';
*/

-- ============================================================
-- 5. 修复函数：确保 RLS 策略允许收件人读取正式信
-- ============================================================

-- 确保 RLS 策略正确：收件人可以读取 entry_type='today' 且 recipient_id 匹配的信件
-- 不需要 opened_at 不为空（正式信寄出即可见）
drop policy if exists "active members can read visible journal entries" on public.journal_entries;

create policy "active members can read visible journal entries"
on public.journal_entries for select to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    -- 作者可以读自己写的信（包括已删除的，用于回收站）
    (author_id = auth.uid())
    or (
      -- 收件人可以读寄给自己的信
      recipient_id = auth.uid()
      and withdrawn_at is null
      and (
        -- 正式信（today 类型且有收件人）：寄出即可见
        (entry_type = 'today' and deleted_at is null)
        -- 胶囊信（future 类型）：需要已开启
        or (entry_type = 'future' and opened_at is not null)
      )
    )
  )
);

-- ============================================================
-- 6. 验证查询：模拟两个用户的视角
-- ============================================================
-- 将 <USER_A_ID> 和 <USER_B_ID> 替换为实际的用户 ID

/*
-- 用户 A 的视角
select
  id,
  case
    when author_id = '<USER_A_ID>' then 'sent'
    when recipient_id = '<USER_A_ID>' then 'inbox'
    else 'invalid'
  end as box_for_a,
  author_id = '<USER_A_ID>' as is_author_a,
  recipient_id = '<USER_A_ID>' as is_recipient_a
from public.journal_entries
where published_at is not null
  and recipient_id is not null
  and (author_id = '<USER_A_ID>' or recipient_id = '<USER_A_ID>')
order by published_at desc;

-- 用户 B 的视角
select
  id,
  case
    when author_id = '<USER_B_ID>' then 'sent'
    when recipient_id = '<USER_B_ID>' then 'inbox'
    else 'invalid'
  end as box_for_b,
  author_id = '<USER_B_ID>' as is_author_b,
  recipient_id = '<USER_B_ID>' as is_recipient_b
from public.journal_entries
where published_at is not null
  and recipient_id is not null
  and (author_id = '<USER_B_ID>' or recipient_id = '<USER_B_ID>')
order by published_at desc;
*/
