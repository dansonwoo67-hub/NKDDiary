-- Read-only pre-migration audit for the final letter/notification lifecycle.
-- This query returns aggregate counts and function names only. It does not
-- select message bodies, email addresses, user IDs, or row IDs.

with deletion_functions as (
  select procedure.proname as function_name
  from pg_proc as procedure
  join pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'delete_letter_diary',
      'purge_letter_diary',
      'empty_letter_recycle_bin',
      'auto_purge_letter_deletions'
    )
),
letter_counts as (
  select
    count(*) filter (
      where entry.withdrawn_at is not null
        and entry.deleted_at is not null
    ) as mixed_state_letters
  from public.journal_entries as entry
),
notification_counts as (
  select
    count(*) filter (
      where notification.is_active = true
        and notification.type in ('journal_created', 'future_diary_opened')
        and entry.withdrawn_at is not null
    ) as active_withdrawn_notifications,
    count(*) filter (
      where notification.is_active = true
        and notification.type in ('journal_created', 'future_diary_opened')
        and entry.id is null
    ) as orphan_notifications,
    count(*) filter (
      where notification.is_active = true
        and notification.is_read = false
        and notification.type in ('journal_created', 'future_diary_opened')
        and entry.opened_at is not null
        and entry.recipient_id = notification.recipient_id
    ) as opened_letter_unread_notifications
  from public.notifications as notification
  left join public.journal_entries as entry
    on entry.id = notification.source_id
),
deletion_table_count as (
  select count(*) as row_count
  from public.letter_deletions
)
select jsonb_build_object(
  'letter_deletions_rows', deletion_table_count.row_count,
  'deletion_rpcs', coalesce(
    (
      select jsonb_agg(function_name order by function_name)
      from deletion_functions
    ),
    '[]'::jsonb
  ),
  'active_withdrawn_notifications',
    notification_counts.active_withdrawn_notifications,
  'orphan_notifications',
    notification_counts.orphan_notifications,
  'opened_letter_unread_notifications',
    notification_counts.opened_letter_unread_notifications,
  'mixed_state_letters',
    letter_counts.mixed_state_letters
) as audit
from deletion_table_count
cross join notification_counts
cross join letter_counts;
