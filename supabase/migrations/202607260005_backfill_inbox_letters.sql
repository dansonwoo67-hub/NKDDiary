-- Align the inbox notification stream with the same partner-journal source used by the calendar.
-- Safe to run more than once.

alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete restrict;

-- Repair sender ownership on existing letter notifications.
update public.notifications as notification
set actor_id = journal.author_id
from public.journal_entries as journal
where notification.source_id = journal.id
  and notification.type::text in ('journal_created', 'future_diary_opened')
  and notification.actor_id is distinct from journal.author_id;

-- Remove invalid first-person inbox rows that point back to the author's own journal.
delete from public.notifications as notification
using public.journal_entries as journal
where notification.source_id = journal.id
  and notification.type::text in ('journal_created', 'future_diary_opened')
  and (
    notification.recipient_id = journal.author_id
    or (journal.entry_type = 'future' and notification.recipient_id is distinct from journal.recipient_id)
  );

-- Backfill the last 30 days of partner today-diaries as incoming letters.
insert into public.notifications (recipient_id, actor_id, type, source_id, title, body, is_read, created_at)
select
  member.user_id,
  journal.author_id,
  'journal_created'::text::public.notification_type,
  journal.id,
  '对方寄来一封信',
  '对方寄来一封信',
  true,
  journal.published_at
from public.journal_entries as journal
join public.space_members as member
  on member.space_id = journal.space_id
 and member.active
 and member.user_id <> journal.author_id
where journal.entry_type = 'today'
  and journal.published_at >= now() - interval '30 days'
  and not exists (
    select 1
    from public.notifications as existing
    where existing.recipient_id = member.user_id
      and existing.source_id = journal.id
      and existing.type::text = 'journal_created'
  );

-- Ensure future-capsule notifications also retain the true sender.
update public.notifications as notification
set actor_id = journal.author_id
from public.journal_entries as journal
where notification.source_id = journal.id
  and notification.type::text = 'future_diary_opened'
  and notification.recipient_id = journal.recipient_id;
