-- 添加 skin 字段到 profiles 表
alter table if exists public.profiles
add column if not exists skin text default 'cream' check (skin in ('cream', 'rose', 'galaxy'));

-- 添加 partner_nickname 字段到 profiles 表
alter table if exists public.profiles
add column if not exists partner_nickname text check (char_length(partner_nickname) between 1 and 12);

-- 创建 update_partner_nickname 函数
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

-- 创建 update_profile_skin 函数
create or replace function public.update_profile_skin(
  p_skin text
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

  if p_skin not in ('cream', 'rose', 'galaxy') then
    raise exception '无效的皮肤选项' using errcode = '22023';
  end if;

  update public.profiles
  set skin = p_skin
  where id = v_actor;
end;
$$;

grant execute on function public.update_profile_skin(text) to authenticated;
