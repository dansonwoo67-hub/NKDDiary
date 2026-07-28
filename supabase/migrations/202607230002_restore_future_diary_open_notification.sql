create or replace function public.open_future_diary(p_entry_id uuid)
returns table (id uuid, opened_at timestamptz, opened_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_space_id uuid;
  v_author_id uuid;
  v_recipient_id uuid;
  v_open_at timestamptz;
begin
  select journal.space_id, journal.author_id, journal.recipient_id, journal.open_at
  into v_space_id, v_author_id, v_recipient_id, v_open_at
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and journal.entry_type = 'future'
  for update;

  if not found
    or v_recipient_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_now < v_open_at then
    raise exception 'journal entry is not ready' using errcode = '55000';
  end if;

  update public.journal_entries
  set opened_at = coalesce(public.journal_entries.opened_at, v_now),
      opened_by = coalesce(public.journal_entries.opened_by, auth.uid())
  where public.journal_entries.id = p_entry_id;

  insert into public.notifications(
    recipient_id, type, source_id, title, body, future_diary_opened
  )
  values (
    v_author_id,
    'future_diary_opened'::text::public.notification_type,
    p_entry_id,
    '未来日记已被开启',
    '对方打开了你封存的未来日记。',
    true
  )
  on conflict (recipient_id, type, source_id)
  where future_diary_opened
  do nothing;

  return query
  select journal.id, journal.opened_at, journal.opened_by
  from public.journal_entries as journal
  where journal.id = p_entry_id;
end;
$$;

revoke execute on function public.open_future_diary(uuid) from public, anon;
grant execute on function public.open_future_diary(uuid) to authenticated;
