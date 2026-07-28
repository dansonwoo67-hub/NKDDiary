create or replace function public.open_future_diary(p_entry_id uuid)
returns table (id uuid, opened_at timestamptz, opened_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_space_id uuid;
  v_recipient_id uuid;
  v_open_at timestamptz;
begin
  select journal.space_id, journal.recipient_id, journal.open_at
  into v_space_id, v_recipient_id, v_open_at
  from public.journal_entries as journal
  where journal.id = p_entry_id
    and journal.entry_type = 'future'
  for update;

  if not found then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_recipient_id <> auth.uid()
    or not public.is_active_space_member(v_space_id, auth.uid())
  then
    raise exception 'journal entry not found' using errcode = 'P0002';
  end if;
  if v_now < v_open_at then
    raise exception 'journal entry is not ready' using errcode = '55000';
  end if;

  return query
  update public.journal_entries
  set opened_at = coalesce(public.journal_entries.opened_at, now()),
      opened_by = coalesce(public.journal_entries.opened_by, auth.uid())
  where public.journal_entries.id = p_entry_id
  returning public.journal_entries.id,
            public.journal_entries.opened_at,
            public.journal_entries.opened_by;
end;
$$;

revoke execute on function public.open_future_diary(uuid) from public, anon;
grant execute on function public.open_future_diary(uuid) to authenticated;
