# v1.0.0 Deprecated Migration Inventory

## Product-retired deletion system

The following historical migrations contain deletion, recycle-bin, or purge
behavior that is not part of the v1.0.0 product:

### `202607260009_journal_letter_v1.sql`

Historical behavior includes:

- `delete_letter_diary`
- `purge_letter_diary`
- `empty_letter_recycle_bin`
- `deleted_at`/`purge_at` as active letter lifecycle state
- recycle-bin indexes and queries

Final disposition:

- Keep the file as historical evidence.
- Do not expose or recreate deletion RPCs.
- Keep `journal_entries.deleted_at` and `journal_entries.purge_at` only as
  historical compatibility columns.

### `202607280006_split_recall_and_delete.sql`

Historical behavior includes:

- `letter_deletions`
- per-user deletion records
- `auto_purge_letter_deletions`
- delete/purge/empty-recycle-bin RPCs
- RLS policies for the deletion table

Final disposition:

- Keep the file as historical evidence.
- Do not include `letter_deletions` or its indexes/policies in the baseline.
- Do not include any deletion or purge RPC in the baseline.

### `202607280009_finalize_letter_notification_state.sql`

This is not deprecated as a whole. It is final-state evidence that retires the
objects above:

- drops deletion/purge RPCs
- drops `auto_purge_letter_deletions`
- drops `letter_deletions`
- retains historical compatibility columns
- defines withdrawal as `withdrawn_at`
- deactivates notifications non-destructively

Its final object definitions are absorbed into the baseline; its cleanup steps
do not need to be replayed on an empty database when retired objects are never
created.

## Superseded hotfix migrations

The following files are historical intermediate states. Their final outcomes
are included through the final production object definitions, not by replaying
each replacement:

- `202607230001_fix_open_future_diary.sql`
- `202607230002_restore_future_diary_open_notification.sql`
- `202607260002_home_v7_rules.sql`
- `202607260003_notification_actor_hotfix.sql`
- `202607260004_notification_enum_compat.sql`
- `202607260007_memory_tree_rules.sql`
- `202607270001_fix_journal_rls.sql`
- `202607270005_fix_letter_classification.sql`
- `202607270006_fix_mood_notification_body.sql`
- `202607270007_fix_draft_upsert_return_id.sql`
- `202607270010_partner_nickname_notification.sql`
- `202607280001_fix_notification_types.sql`
- `202607280002_notification_enum_fix.sql`
- `202607280004_add_notification_metadata.sql`
- `202607280005_fix_notification_triggers.sql`
- `202607280007_notification_is_active.sql`
- `202607280008_simplify_letters_and_notifications.sql`
- `20260728110538_resolve_capsule_rpc_overload.sql`

“Superseded” does not mean the files can be deleted. They should remain in the
pre-v1.0 archive with checksums and mapping metadata.

## Data-only repair migrations

The following files contain historical backfill or normalization intent:

- `202607260005_backfill_inbox_letters.sql`
- `202607260006_inbox_read_baseline.sql`
- `202607280003_fix_history_notifications.sql`

They must not be copied blindly into a schema-only baseline. Any seed or
compatibility data required by a new environment must be separately identified,
documented, non-sensitive, deterministic, and idempotent.

## Final v1.0.0 absence requirements

An empty environment created from the future baseline must satisfy:

- `letter_deletions` does not exist.
- `delete_letter_diary` does not exist.
- `purge_letter_diary` does not exist.
- `empty_letter_recycle_bin` does not exist.
- `auto_purge_letter_deletions` does not exist.
- no UI or service contract depends on those objects.
- withdrawal uses `journal_entries.withdrawn_at`.
- withdrawn/orphan notifications use non-destructive `is_active=false`.
