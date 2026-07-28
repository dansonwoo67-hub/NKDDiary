# V7.3 inbox/calendar consistency hotfix

The calendar derives incoming letters from partner journal entries, while the inbox previously depended only on notification rows. Existing journals created before the trigger therefore appeared on the calendar but not in the inbox.

Run `supabase/migrations/202607260005_backfill_inbox_letters.sql` once in Supabase SQL Editor. It repairs sender ownership, removes self-addressed notification rows, and backfills the last 30 days of partner letters.
