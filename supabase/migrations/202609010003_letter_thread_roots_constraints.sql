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
  v_id uuid := gen_random_uuid();
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
    id, thread_id, reply_to_id,
    space_id, author_id, recipient_id, entry_type, title, content,
    rich_content, plain_text, excerpt, stationery_theme, mood_emoji,
    entry_date, created_local_date, published_at, locked_at
  ) values (
    v_id, v_id, null,
    p_space_id, v_actor, p_recipient_id, 'today', '', v_text,
    p_rich_content, v_text, left(v_text, 88), p_stationery_theme, p_mood_emoji,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    (clock_timestamp() at time zone 'Asia/Shanghai')::date,
    clock_timestamp(), clock_timestamp() + interval '24 hours'
  );
  return v_id;
end;
$$;

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
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_entry public.journal_entries;
  v_capsule_count integer;
begin
  if v_user_id is null or not public.is_active_space_member(p_space_id, v_user_id) then
    raise exception 'active space membership required' using errcode = '42501';
  end if;
  if p_recipient_id = v_user_id or not public.is_active_space_member(p_space_id, p_recipient_id) then
    raise exception 'recipient must be the other active member' using errcode = '22023';
  end if;
  if p_open_at <= v_now then
    raise exception 'open time must be in the future' using errcode = '22007';
  end if;

  select count(*) into v_capsule_count
  from public.journal_entries
  where author_id = v_user_id
    and entry_type = 'future'
    and status in ('scheduled', 'sent', 'cancelled')
    and (scheduled_created_at at time zone 'Asia/Shanghai')::date = v_local_date;
  if v_capsule_count >= 1 then
    raise exception 'DAILY_CAPSULE_LETTER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into public.journal_entries(
    id, thread_id, reply_to_id,
    space_id, author_id, recipient_id, entry_type, title, content, image_path,
    created_local_date, published_at, locked_at, sealed_at, open_at,
    status, scheduled_created_at
  ) values (
    v_id, v_id, null,
    p_space_id, v_user_id, p_recipient_id, 'future', btrim(p_title), btrim(p_content), p_image_path,
    v_local_date, v_now, v_now, v_now, p_open_at, 'scheduled', v_now
  ) returning * into v_entry;
  return v_entry;
end;
$$;

alter table public.journal_entries
  add constraint journal_entries_thread_id_fkey
    foreign key (thread_id) references public.journal_entries(id) on delete restrict not valid,
  add constraint journal_entries_reply_to_id_fkey
    foreign key (reply_to_id) references public.journal_entries(id) on delete restrict not valid,
  add constraint journal_entries_reply_not_self_check
    check (reply_to_id is null or reply_to_id <> id) not valid,
  add constraint journal_entries_thread_shape_check
    check (
      (entry_type = 'today' and recipient_id is null and thread_id is null and reply_to_id is null)
      or
      (recipient_id is not null and reply_to_id is null
        and entry_type in ('today', 'future') and thread_id = id)
      or
      (recipient_id is not null and reply_to_id is not null
        and entry_type = 'today' and thread_id is not null)
    ) not valid;

create or replace function public.preserve_journal_entry_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.thread_id is distinct from old.thread_id
    or new.reply_to_id is distinct from old.reply_to_id
  then
    raise exception 'journal entry thread identity is immutable' using errcode = '23514';
  end if;
  if new.id is distinct from old.id
    or new.space_id is distinct from old.space_id
    or new.author_id is distinct from old.author_id
    or new.recipient_id is distinct from old.recipient_id
    or new.entry_type is distinct from old.entry_type
    or new.entry_date is distinct from old.entry_date
    or new.created_local_date is distinct from old.created_local_date
    or new.published_at is distinct from old.published_at
    or new.locked_at is distinct from old.locked_at
    or new.sealed_at is distinct from old.sealed_at
    or new.open_at is distinct from old.open_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'journal entry identity and schedule are immutable' using errcode = '23514';
  end if;
  if old.entry_type = 'future' and (
    new.title is distinct from old.title
    or new.content is distinct from old.content
    or new.image_path is distinct from old.image_path
  ) then
    raise exception 'sealed future diary content is immutable' using errcode = '23514';
  end if;
  if old.opened_at is not null and (
    new.opened_at is distinct from old.opened_at
    or new.opened_by is distinct from old.opened_by
  ) then
    raise exception 'journal open state is immutable once recorded' using errcode = '23514';
  end if;
  return new;
end;
$$;
