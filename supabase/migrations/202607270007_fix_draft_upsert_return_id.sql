-- =============================================================================
-- Fix upsert_journal_draft: return uuid, hardened security, space-scoped unique
-- =============================================================================
--
-- 修复要点：
--   1. 函数返回 uuid（草稿 ID），让前端能区分 create / update
--   2. 函数内校验 auth.uid()  ==  p_author_id，防止伪造
--   3. 校验 author 与 recipient 均为同一空间的活跃成员
--   4. UPDATE 语句同时带 author_id + space_id 双重条件
--   5. 唯一约束从 (author_id) 改为 (space_id, author_id)
--      支持未来多空间扩展，同时确保每空间每人仅一封草稿
--
-- 依赖关系检查：
--   journal_drafts_set_updated_at trigger 调用 public.set_updated_at()，
--   本 migration 不触及该 trigger，仅替换 upsert_journal_draft 函数。
--
-- 使用的空间成员表：public.space_members(space_id, user_id, active)

-- ---------- 1. 删除旧函数（精确签名） ----------
drop function if exists public.upsert_journal_draft(
  uuid,   -- p_space_id
  uuid,   -- p_author_id
  uuid,   -- p_recipient_id
  jsonb,  -- p_rich_text_json
  text,   -- p_plain_text
  text,   -- p_mood_emoji
  text,   -- p_stationery_theme
  text,   -- p_salutation
  integer -- p_character_count
);

-- ---------- 2. 替换唯一约束：(author_id) → (space_id, author_id) ----------
-- 先创建复合唯一约束（更宽松，不会与现有数据冲突）
create unique index if not exists journal_drafts_space_author_unique_idx
  on public.journal_drafts(space_id, author_id);

-- 再删除旧的单列唯一索引（已被复合约束覆盖）
drop index if exists public.journal_drafts_author_id_unique_idx;

-- ---------- 3. 重建函数 ----------
create function public.upsert_journal_draft(
  p_space_id uuid,
  p_author_id uuid,
  p_recipient_id uuid,
  p_rich_text_json jsonb,
  p_plain_text text,
  p_mood_emoji text,
  p_stationery_theme text,
  p_salutation text,
  p_character_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft_id uuid;
begin
  -- ========== 身份校验 ==========
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_author_id <> auth.uid() then
    raise exception 'author mismatch: p_author_id does not match authenticated user' using errcode = '42501';
  end if;

  -- ========== 参数校验 ==========
  if p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined') then
    raise exception 'invalid stationery theme' using errcode = '22023';
  end if;

  if p_mood_emoji is not null
     and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭') then
    raise exception 'invalid mood emoji' using errcode = '22023';
  end if;

  -- ========== 空间成员校验 ==========
  -- author 必须是该空间的活跃成员
  if not exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = p_author_id
      and active
  ) then
    raise exception 'author is not an active member of this space' using errcode = '42501';
  end if;

  -- recipient 必须是同一空间的另一位活跃成员
  if not exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = p_recipient_id
      and active
      and user_id <> p_author_id
  ) then
    raise exception 'recipient is not an active member of this space or is the same as author' using errcode = '42501';
  end if;

  -- ========== Upsert ==========
  -- 先尝试更新（在唯一约束 space_id + author_id 保证下最多命中一行）
  update public.journal_drafts
  set
    recipient_id      = p_recipient_id,
    rich_text_json    = p_rich_text_json,
    plain_text        = p_plain_text,
    mood_emoji        = p_mood_emoji,
    stationery_theme  = p_stationery_theme,
    salutation        = p_salutation,
    character_count   = p_character_count,
    updated_at        = clock_timestamp()
  where author_id = p_author_id
    and space_id = p_space_id
  returning id into v_draft_id;

  -- 若不存在则创建
  if v_draft_id is null then
    insert into public.journal_drafts (
      space_id,
      author_id,
      recipient_id,
      rich_text_json,
      plain_text,
      mood_emoji,
      stationery_theme,
      salutation,
      character_count
    ) values (
      p_space_id,
      p_author_id,
      p_recipient_id,
      p_rich_text_json,
      p_plain_text,
      p_mood_emoji,
      p_stationery_theme,
      p_salutation,
      p_character_count
    )
    returning id into v_draft_id;
  end if;

  return v_draft_id;
end;
$$;

-- ---------- 4. 重新授权 ----------
revoke execute on function public.upsert_journal_draft(
  uuid,uuid,uuid,jsonb,text,text,text,text,integer
) from public, anon;

grant execute on function public.upsert_journal_draft(
  uuid,uuid,uuid,jsonb,text,text,text,text,integer
) to authenticated;

-- ---------- 5. 验证查询 ----------
-- 确认函数签名与返回类型
select
  p.proname,
  pg_catalog.pg_get_function_result(p.oid) as return_type,
  pg_catalog.pg_get_function_arguments(p.oid) as arguments
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public'
  and p.proname = 'upsert_journal_draft';

-- 确认唯一约束已切换为 (space_id, author_id)
select
  indexname,
  indexdef
from pg_indexes
where tablename = 'journal_drafts';