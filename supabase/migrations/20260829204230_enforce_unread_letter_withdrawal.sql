-- Ordinary letters may be withdrawn only while unread and within the existing
-- withdrawal window. The conditional update is the concurrency boundary:
-- recipient read and sender withdrawal cannot both succeed.
create or replace function public.withdraw_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_id uuid;
  v_entry_type public.journal_entry_type;
  v_opened_at timestamptz;
  v_withdrawn_at timestamptz;
  v_locked_at timestamptz;
begin
  update public.journal_entries
  set withdrawn_at = clock_timestamp()
  where id = p_entry_id
    and author_id = auth.uid()
    and entry_type = 'today'
    and opened_at is null
    and withdrawn_at is null
    and clock_timestamp() <= locked_at
  returning id into v_updated_id;

  if v_updated_id is not null then
    update public.notifications
    set is_active = false, is_read = true
    where source_id = p_entry_id
      and recipient_id <> auth.uid()
      and is_active = true;
    return;
  end if;

  select entry_type, opened_at, withdrawn_at, locked_at
  into v_entry_type, v_opened_at, v_withdrawn_at, v_locked_at
  from public.journal_entries
  where id = p_entry_id
    and author_id = auth.uid();

  if not found then
    raise exception 'letter not found or unauthorized' using errcode = 'P0002';
  elsif v_entry_type = 'future' then
    raise exception 'capsule letters cannot be withdrawn' using errcode = '42501';
  elsif v_withdrawn_at is not null then
    raise exception 'letter already withdrawn' using errcode = '55000';
  elsif v_opened_at is not null then
    raise exception 'letter already read' using errcode = '55000';
  elsif clock_timestamp() > v_locked_at then
    raise exception 'letter withdraw window closed' using errcode = '42501';
  else
    raise exception 'letter withdrawal state changed' using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.withdraw_letter_diary(uuid)
  from public, anon;
grant execute on function public.withdraw_letter_diary(uuid)
  to authenticated, service_role;
