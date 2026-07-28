-- Finalize the letter lifecycle before release.
--
-- Published letters have only two business states:
--   normal    -> withdrawn_at is null
--   withdrawn -> withdrawn_at is not null
--
-- Historical deleted_at/purge_at columns remain for compatibility, but this
-- migration removes every callable letter deletion path and never writes them.

-- ---------- 1. Retire the deleted/recycle-bin lifecycle ----------
drop function if exists public.delete_letter_diary(uuid);
drop function if exists public.purge_letter_diary(uuid);
drop function if exists public.empty_letter_recycle_bin();
drop function if exists public.auto_purge_letter_deletions();
drop table if exists public.letter_deletions;

-- ---------- 2. Withdraw atomically with notification invalidation ----------
create or replace function public.withdraw_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.journal_entries
  set withdrawn_at = clock_timestamp()
  where id = p_entry_id
    and author_id = auth.uid()
    and withdrawn_at is null
    and clock_timestamp() <= locked_at;

  if not found then
    raise exception 'letter withdraw window closed or already withdrawn'
      using errcode = '42501';
  end if;

  update public.notifications
  set is_active = false, is_read = true
  where source_id = p_entry_id
    and recipient_id <> auth.uid()
    and is_active = true;
end;
$$;

revoke execute on function public.withdraw_letter_diary(uuid)
  from public, anon;
grant execute on function public.withdraw_letter_diary(uuid)
  to authenticated;

-- ---------- 3. Mark a normal letter and its notifications read ----------
create or replace function public.mark_letter_read(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.journal_entries
    where id = p_entry_id
      and recipient_id = auth.uid()
      and withdrawn_at is null
  )
  into v_exists;

  if not v_exists then
    raise exception 'letter not found or already withdrawn'
      using errcode = 'P0002';
  end if;

  update public.journal_entries
  set opened_at = coalesce(opened_at, clock_timestamp()),
      opened_by = coalesce(opened_by, auth.uid())
  where id = p_entry_id
    and recipient_id = auth.uid()
    and withdrawn_at is null;

  update public.notifications
  set is_read = true
  where source_id = p_entry_id
    and recipient_id = auth.uid()
    and is_active = true
    and is_read = false;
end;
$$;

revoke execute on function public.mark_letter_read(uuid)
  from public, anon;
grant execute on function public.mark_letter_read(uuid)
  to authenticated;

-- ---------- 4. Do not expose withdrawn letter bodies to recipients ----------
drop policy if exists "active members can read visible journal entries"
  on public.journal_entries;
create policy "active members can read visible journal entries"
on public.journal_entries
for select
to authenticated
using (
  public.is_active_space_member(space_id)
  and (
    author_id = auth.uid()
    or (
      recipient_id = auth.uid()
      and deleted_at is null
      and withdrawn_at is null
      and (
        entry_type = 'today'
        or (entry_type = 'future' and opened_at is not null)
      )
    )
  )
);

-- RLS cannot hide selected columns from an otherwise-visible row. This narrow
-- RPC lets a recipient distinguish a withdrawn letter from a nonexistent one
-- without receiving content, rich_content, plain_text, or other body fields.
create or replace function public.get_letter_withdrawal_status(p_entry_id uuid)
returns table(id uuid, withdrawn_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select entry.id, entry.withdrawn_at
  from public.journal_entries as entry
  where entry.id = p_entry_id
    and entry.recipient_id = auth.uid()
    and entry.withdrawn_at is not null
    and public.is_active_space_member(entry.space_id);
$$;

revoke execute on function public.get_letter_withdrawal_status(uuid) from public, anon;
grant execute on function public.get_letter_withdrawal_status(uuid) to authenticated;

-- ---------- 5. Normalize invalid historical notification state ----------
-- Keep every notification row for audit/history; only remove it from active
-- unread surfaces.
update public.notifications as notification
set is_active = false, is_read = true
from public.journal_entries as entry
where notification.source_id = entry.id
  and notification.type in ('journal_created', 'future_diary_opened')
  and entry.withdrawn_at is not null
  and notification.is_active = true;

update public.notifications as notification
set is_active = false, is_read = true
where notification.type in ('journal_created', 'future_diary_opened')
  and notification.is_active = true
  and not exists (
    select 1
    from public.journal_entries as entry
    where entry.id = notification.source_id
  );
