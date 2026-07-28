-- Memory tree short-form rules: 30-char title, 150-char body, max 3 new memories per Shanghai day.

alter table public.memory_entries
  drop constraint if exists memory_entries_title_check;
alter table public.memory_entries
  add constraint memory_entries_title_check check (char_length(title) between 1 and 30);

alter table public.memory_entries
  drop constraint if exists memory_entries_body_check;
alter table public.memory_entries
  add constraint memory_entries_body_check check (char_length(body) between 1 and 150);

create or replace function public.create_memory_entry(
  p_id uuid,
  p_space_id uuid,
  p_title text,
  p_body text,
  p_occurred_on date,
  p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_expected_path text;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if v_actor is null or not public.is_active_space_member(p_space_id, v_actor) then
    raise exception 'memory space access denied' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 30
     or char_length(v_body) not between 1 and 150
     or p_occurred_on is null then
    raise exception 'invalid memory entry' using errcode = '22023';
  end if;

  v_day_start := ((now() at time zone 'Asia/Shanghai')::date::timestamp at time zone 'Asia/Shanghai');
  v_day_end := v_day_start + interval '1 day';
  if (select count(*) from public.memory_entries
      where author_id = v_actor and created_at >= v_day_start and created_at < v_day_end) >= 3 then
    raise exception 'daily memory limit reached' using errcode = 'P0001';
  end if;

  v_expected_path := p_space_id::text || '/' || v_actor::text || '/' || p_id::text || '.webp';
  if p_image_path is not null and p_image_path is distinct from v_expected_path then
    raise exception 'invalid memory image path' using errcode = '22023';
  end if;

  insert into public.memory_entries(id, space_id, author_id, title, body, occurred_on, image_path)
  values (p_id, p_space_id, v_actor, v_title, v_body, p_occurred_on, p_image_path);
  return p_id;
end;
$$;

create or replace function public.update_memory_entry(
  p_id uuid,
  p_title text,
  p_body text,
  p_occurred_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 30
     or char_length(btrim(coalesce(p_body, ''))) not between 1 and 150
     or p_occurred_on is null then
    raise exception 'invalid memory entry' using errcode = '22023';
  end if;

  update public.memory_entries as memory
  set title = btrim(p_title), body = btrim(p_body), occurred_on = p_occurred_on, updated_at = now()
  where memory.id = p_id
    and memory.author_id = v_actor
    and memory.created_at > now() - interval '24 hours'
    and public.is_active_space_member(memory.space_id, v_actor);

  if not found then
    raise exception 'memory edit window closed' using errcode = '42501';
  end if;
end;
$$;
