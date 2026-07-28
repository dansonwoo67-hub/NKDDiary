-- Fix historical notifications with incorrect types

-- 1. Fix profile_updated notifications - try to determine actual type
-- If body contains "昵称", it's likely a nickname update
-- If body contains "头像", it's likely an avatar update
update public.notifications
set type = 'profile_nickname_updated'
where type = 'profile_updated'
  and body like '%昵称%';

update public.notifications
set type = 'profile_avatar_updated'
where type = 'profile_updated'
  and body like '%头像%';

-- 2. Fix calendar_event notifications - convert to calendar_event_created
update public.notifications
set type = 'calendar_event_created'
where type = 'calendar_event';

-- 3. Remove the unused RawNotification type comment (not needed in SQL)
