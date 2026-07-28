-- =============================================================================
-- Add is_active to notifications + wire withdraw/mark_read to notifications
-- =============================================================================
--
-- Problem:
--   1. withdraw_letter_diary only sets withdrawn_at but doesn't invalidate
--      the recipient's notification → red dot persists after recall.
--   2. mark_letter_read only updates journal_entries.opened_at but doesn't
--      mark the notification as is_read → red dot persists after opening.
--   3. No is_active field on notifications → can't distinguish "viewed"
--      (is_read) from "still valid" (is_active).
--
-- Fix:
--   1. Add is_active column to notifications (default true).
--   2. RLS SELECT only returns is_active = true rows → inactive notifications
--      disappear from queries → red dot disappears immediately on recall.
--   3. withdraw_letter_diary also sets is_active = false on the recipient's
--      journal_created notification.
--   4. mark_letter_read also sets is_read = true on the recipient's
--      journal_created notification → red dot disappears after opening.
--
-- No frontend changes needed — RLS filters inactive notifications server-side.

-- ---------- 1. Add is_active column ----------
alter table public.notifications add column if not exists is_active boolean not null default true;

-- Backfill: all existing notifications are active
update public.notifications set is_active = true where is_active is null;

-- ---------- 2. RLS: only show active notifications to recipients ----------
-- Inactive notifications (e.g. letter recalled) are hidden from SELECT.
-- This means they no longer count toward the unread badge.
drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and is_active = true
);

-- ---------- 3. Modify withdraw_letter_diary: deactivate notification ----------
create or replace function public.withdraw_letter_diary(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Set withdrawn_at on the letter (ONLY withdrawn_at, not deleted_at)
  update public.journal_entries
  set withdrawn_at = clock_timestamp()
  where id = p_entry_id
    and author_id = auth.uid()
    and deleted_at is null
    and withdrawn_at is null
    and clock_timestamp() <= locked_at;

  if not found then
    raise exception 'letter withdraw window closed or already withdrawn' using errcode = '42501';
  end if;

  -- Deactivate the recipient's notification for this letter.
  -- This hides it from the notification center and removes the red dot.
  update public.notifications
  set is_active = false
  where source_id = p_entry_id
    and recipient_id <> auth.uid()
    and is_active = true;
end;
$$;

revoke execute on function public.withdraw_letter_diary(uuid) from public, anon;
grant execute on function public.withdraw_letter_diary(uuid) to authenticated;

-- ---------- 4. Modify mark_letter_read: also mark notification as read ----------
-- When the recipient opens a letter, mark the associated notification as read
-- so the red dot disappears even if they opened the letter directly
-- (not through the notification center).
create or replace function public.mark_letter_read(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Mark the letter as opened
  update public.journal_entries
  set opened_at = coalesce(opened_at, clock_timestamp()),
      opened_by = coalesce(opened_by, auth.uid())
  where id = p_entry_id
    and recipient_id = auth.uid()
    and withdrawn_at is null;

  if not found then
    raise exception 'letter not found or already withdrawn' using errcode = 'P0002';
  end if;

  -- Mark the recipient's notification for this letter as read
  update public.notifications
  set is_read = true
  where source_id = p_entry_id
    and recipient_id = auth.uid()
    and is_read = false;
end;
$$;

revoke execute on function public.mark_letter_read(uuid) from public, anon;
grant execute on function public.mark_letter_read(uuid) to authenticated;

-- ---------- 5. Verification ----------
-- Check is_active column exists
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'notifications' and column_name = 'is_active';

-- Check withdraw_letter_diary deactivates notifications
select proname from pg_proc
where proname = 'withdraw_letter_diary'
  and prosrc like '%is_active = false%';

-- Check mark_letter_read marks notifications as read
select proname from pg_proc
where proname = 'mark_letter_read'
  and prosrc like '%is_read = true%';
