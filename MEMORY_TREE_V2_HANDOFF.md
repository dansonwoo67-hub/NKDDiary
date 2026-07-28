# Memory Tree V2 handoff

Implemented:
- Sticky filter bar that remains readable and does not cover cards.
- Desktop left-side year/month navigator with active month tracking and smooth jump.
- Author name/avatar snapshots for memories, moods, and calendar anniversaries.
- Historical rows backfilled from current profile as a one-time fallback.
- Hand-drawn gramophone floating player using NetEase playlist `18189032813`.
- Open, collapse, fully hide/reopen, and open-in-NetEase controls.
- Cursor heart/star trail, disabled for reduced-motion users.

Required migration:
- `supabase/migrations/202607260008_memory_tree_v2.sql`

NetEase limitation:
- Playback controls live inside the official cross-origin embedded player. Browser security prevents the surrounding page from reliably commanding next/previous tracks. The embed itself provides its supported playlist controls.
