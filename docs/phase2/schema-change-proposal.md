# Phase 2 Schema Change Proposal

Status: **proposal only**. No migration was generated or executed.

## Why current schema is insufficient

`journal_entries` has no explicit conversation identity or direct reply relationship. Historical rows cannot be safely grouped, and recursive inference from participants or `reply_to_id` would be ambiguous.

## Proposed additive columns

| Object | Addition | Nullable | Purpose |
| --- | --- | --- | --- |
| `journal_entries` | `thread_id uuid` | yes | Stable identity shared by every letter in one exchange. |
| `journal_entries` | `reply_to_id uuid` | yes | Direct parent letter for a reply. |

Proposed foreign keys should reference `journal_entries(id)` with non-destructive behavior (`ON DELETE RESTRICT` or the project’s established equivalent). `reply_to_id` and `thread_id` must not be interchangeable. A future implementation may use either a dedicated thread table or a generated UUID for `thread_id`; that choice requires a separate migration review.

## Indexes

- B-tree index on `(space_id, thread_id, published_at DESC)` where `thread_id IS NOT NULL` for thread listing and pagination.
- B-tree index on `reply_to_id` where `reply_to_id IS NOT NULL` for direct-parent validation.
- If a dedicated thread table is selected later, unique thread identity and participant access indexes belong there rather than being emulated by recursive queries.

## Backfill strategy

No historical backfill. Existing rows remain `thread_id=NULL` and `reply_to_id=NULL`; the domain adapter treats each as an independent one-letter thread. Only newly created Phase 2 threads receive explicit IDs.

## Historical compatibility

- No row is rewritten or reclassified.
- `today + recipient_id IS NULL` remains legacy and outside the current product letter domain.
- Existing ordinary, capsule, opened and withdrawn facts remain unchanged.
- Deleted/recycle-bin objects are not restored.

## RLS and RPC impact

Future create/reply RPCs must verify active space membership, that both letters belong to the same space and participants, that `reply_to_id` exists and is accessible, and that capsule replies occur only after opening. New columns must not broaden current row visibility. SECURITY DEFINER RPCs require explicit `auth.uid()` checks, fixed `search_path`, revoked PUBLIC/anon execute, and explicit authenticated/service-role grants.

## Notification impact

Future letter notifications may store a thread target plus the concrete new letter ID. `is_read` and `is_active` semantics remain unchanged; `opened_at` does not become a badge source.

## Rollback

Application rollback ignores nullable columns and continues treating rows as standalone letters. Physical column/index removal is unnecessary and should not occur during an incident rollback. No data rollback is required because historical rows are untouched.

## Migration risk

- Low locking risk for nullable columns, but index creation should use an online-safe production procedure appropriate to Supabase/Postgres.
- Medium authorization risk if reply RPC validation or RLS is incomplete.
- High semantic risk if anyone backfills or infers historical threads; explicitly prohibited.
- Migration requires a fresh read-only production audit and separate approval before SQL is authored or applied.
