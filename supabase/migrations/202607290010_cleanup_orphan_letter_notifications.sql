-- =============================================================================
-- Cleanup orphan letter notifications
--
-- Problem: 11 active unread future_diary_opened notifications reference
-- journal_entries rows that have been hard-deleted (by E2E test cleanup or
-- the delete_today_diary function). Clicking these notifications shows
-- "这封信暂时没有找到。" because the source letter no longer exists.
--
-- This migration is a one-time data fix. It does NOT:
--   - delete any notification rows
--   - modify table structure
--   - modify RLS policies
--   - modify RPC functions
--   - modify the letter state machine
--
-- It only sets is_active=false and is_read=true for letter-type notifications
-- whose source_id no longer exists in journal_entries, removing them from the
-- inbox red-dot count and notification center without losing audit history.
-- =============================================================================

update public.notifications
set is_active = false,
    is_read = true
where type in ('journal_created', 'future_diary_opened')
  and is_active = true
  and not exists (
    select 1
    from public.journal_entries as entry
    where entry.id = notifications.source_id
  );
