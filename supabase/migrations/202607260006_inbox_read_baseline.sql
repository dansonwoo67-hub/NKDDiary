-- One-time V7.4 inbox baseline.
-- Existing incoming-letter notifications predate reliable notification backfill,
-- so keep them in the latest-five inbox list without falsely showing a new red badge.
-- New letters created after this migration continue to use the normal unread default.

update public.notifications
set is_read = true
where type::text in ('journal_created', 'future_diary_opened')
  and created_at <= now();
