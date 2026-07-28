-- V7.1 hotfix: make the notification actor column available.
alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete restrict;

create index if not exists notifications_recipient_recent_idx
  on public.notifications(recipient_id, created_at desc);

-- Old notifications have no reliable sender ownership, so do not surface them
-- as current first-person inbox/activity notifications.
update public.notifications
set is_read = true
where actor_id is null;
