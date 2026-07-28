-- 更新 update_partner_nickname 函数，添加通知逻辑
-- 当用户保存爱称时，通知对方

-- 添加新的通知类型
alter type public.notification_type add value if not exists 'partner_nickname_updated';

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
  v_space_id uuid;
  v_partner_id uuid;
  v_author_name text;
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

  -- 获取空间 ID
  select space_id into v_space_id
  from public.space_members
  where user_id = v_actor and active;

  if v_space_id is not null then
    -- 获取伴侣 ID
    select user_id into v_partner_id
    from public.space_members
    where space_id = v_space_id and active and user_id <> v_actor;

    if v_partner_id is not null then
      -- 获取当前用户的昵称
      select display_name into v_author_name
      from public.profiles where id = v_actor;

      -- 创建通知
      insert into public.notifications(
        recipient_id, actor_id, type, source_id, title, body
      ) values (
        v_partner_id, v_actor, 'partner_nickname_updated', null,
        v_author_name || ' 给你留了一个新的称呼',
        '「' || p_nickname || '」'
      );
    end if;
  end if;
end;
$$;

grant execute on function public.update_partner_nickname(text) to authenticated;
