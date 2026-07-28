# Memory Tree V1

Implemented:
- Top counters: 全部 / 回忆 / 心情 / 纪念日.
- Renamed 独立回忆 to 回忆.
- Memory title max 30 chars; body required and max 150 chars.
- Server action and Supabase RPC both enforce max 3 new memory entries per user per Shanghai day.
- Sticky readable capsule filters: 全部 / 回忆 / 心情 / 纪念日 / 照片.
- Date is the primary tree axis: year rings, month branches, prominent day and weekday nodes.
- Memory, mood and anniversary nodes use different fruit/flower metaphors.
- Preview truncation plus detail dialog.
- Image lightbox and original-image download link.
- Author names are resolved from profiles.

Run this new migration after previous migrations:
`supabase/migrations/202607260007_memory_tree_rules.sql`

Then preserve `.env.local`, run `npm install`, `npm test`, `npm run lint`, `npm run build`, `npm run dev`.
