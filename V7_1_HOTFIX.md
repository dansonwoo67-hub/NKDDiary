# V7.1 notification actor hotfix

The homepage crashed because the application queried `notifications.actor_id`
before the database contained that column.

Run this migration in Supabase SQL Editor:

`supabase/migrations/202607260003_notification_actor_hotfix.sql`

Then restart the Next.js dev server.

The application now also degrades safely to empty inbox/activity lists if this
migration is missing, rather than crashing the whole page.
