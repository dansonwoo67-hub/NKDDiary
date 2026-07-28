# Journal Letter V1 handoff

Migration: `supabase/migrations/202607260009_journal_letter_v1.sql`

Implemented:
- titleless 5000-character rich letter composer
- six stationery themes
- emoji and kaomoji insertion
- simple yes/no confirmation
- paper-fold and white-dove send animation
- sent/inbox/recycle envelope cards with full date
- 24-hour edit/withdraw/delete window with only `可编辑至 ...` hint
- 180-day recycle bin and permanent deletion RPCs
- 200-character, 24-hour-manageable comments
- recipient read tracking

Run the migration in Supabase SQL Editor before testing. The package excludes `.env.local`, `node_modules`, and `.next`.
