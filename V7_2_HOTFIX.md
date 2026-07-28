# V7.2 calendar enum compatibility hotfix

## Root cause

The month calendar queried the PostgreSQL enum column with `journal_created` and
`future_diary_ready`. On databases where those enum values were not committed,
PostgREST rejected the entire query and the homepage crashed.

## Code fix

The calendar now loads the recipient's recent notifications without an enum
`IN (...)` filter, then filters supported letter notification types in
TypeScript. An older database can therefore render the homepage instead of
crashing.

## Database repair order

Run these in Supabase SQL Editor as separate executions:

1. `supabase/migrations/202607260004_notification_enum_compat.sql`
2. `supabase/migrations/202607260001_home_activity_and_location_history.sql`
3. `supabase/migrations/202607260002_home_v7_rules.sql`
4. `supabase/migrations/202607260003_notification_actor_hotfix.sql`

The first script must finish successfully before running scripts that create
triggers using the new enum values.
