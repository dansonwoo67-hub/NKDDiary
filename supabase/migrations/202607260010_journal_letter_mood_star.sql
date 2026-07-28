-- Add mood emoji and star bookmark to journal letters

alter table public.journal_entries
  add column if not exists mood_emoji text,
  add column if not exists star_at timestamptz;

alter table public.journal_entries add constraint journal_entries_mood_emoji_check
  check (mood_emoji is null or mood_emoji in ('😊','💕','🥺','😤','😴','🤔','😌','😭')) not valid;

create index if not exists journal_entries_starred_idx
on public.journal_entries(author_id, star_at desc)
where star_at is not null and deleted_at is null;

-- Update create_letter_diary to include mood_emoji
create or replace function public.create_letter_diary(
  p_space_id uuid,
  p_recipient_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if v_actor is null
    or not public.is_active_space_member(p_space_id, v_actor)
    or p_recipient_id = v_actor
    or not public.is_active_space_member(p_space_id, p_recipient_id)
  then raise exception 'letter access denied' using errcode = '42501'; end if;
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
    or (p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭'))
  then raise exception 'invalid letter' using errcode = '22023'; end if;

  insert into public.journal_entries(
    space_id, author_id, recipient_id, entry_type, title, content,
    rich_content, plain_text, excerpt, stationery_theme, mood_emoji,
    entry_date, created_local_date, published_at, locked_at
  ) values (
    p_space_id, v_actor, p_recipient_id, 'today', '', v_text,
    p_rich_content, v_text, left(v_text, 88), p_stationery_theme, p_mood_emoji,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    clock_timestamp(), clock_timestamp() + interval '24 hours'
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Update update_letter_diary to include mood_emoji
create or replace function public.update_letter_diary(
  p_entry_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_text text := normalize(btrim(coalesce(p_plain_text, '')), NFC);
begin
  if char_length(v_text) not between 1 and 5000
    or jsonb_typeof(p_rich_content) <> 'object'
    or p_stationery_theme not in ('cream','rose','moon','vintage','sakura','lined')
    or (p_mood_emoji is not null and p_mood_emoji not in ('😊','💕','🥺','😤','😴','🤔','😌','😭'))
  then raise exception 'invalid letter' using errcode = '22023'; end if;
  update public.journal_entries
  set content=v_text, rich_content=p_rich_content, plain_text=v_text,
      excerpt=left(v_text,88), stationery_theme=p_stationery_theme, 
      mood_emoji=p_mood_emoji, updated_at=clock_timestamp()
  where id=p_entry_id and author_id=auth.uid() and deleted_at is null
    and withdrawn_at is null and clock_timestamp() <= locked_at;
  if not found then raise exception 'letter edit window closed' using errcode='42501'; end if;
end;
$$;

-- Star toggle function
create or replace function public.toggle_letter_star(p_entry_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_current timestamptz;
begin
  select star_at into v_current from public.journal_entries
  where id=p_entry_id and (author_id=auth.uid() or recipient_id=auth.uid())
    and deleted_at is null;
  if not found then raise exception 'letter not found' using errcode='P0002'; end if;
  update public.journal_entries
  set star_at=case when v_current is null then clock_timestamp() else null end
  where id=p_entry_id;
  return v_current is null;
end; $$;

revoke execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text) from authenticated;
revoke execute on function public.update_letter_diary(uuid,jsonb,text,text) from authenticated;
grant execute on function public.create_letter_diary(uuid,uuid,jsonb,text,text,text) to authenticated;
grant execute on function public.update_letter_diary(uuid,jsonb,text,text,text) to authenticated;
grant execute on function public.toggle_letter_star(uuid) to authenticated;
