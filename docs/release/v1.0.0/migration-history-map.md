# v1.0.0 Migration History Map

## Purpose

This document maps the 14 production migration-history entries to the 42 local
SQL files by purpose. A semantic match does not mean the migration versions or
SQL checksums are identical.

The production database has already passed the v1.0.0 release audit. No local
historical migration should be replayed against it solely to make the two lists
look alike.

## Production 14-entry history

| # | Production version | Production name | Local semantic source | Relationship |
|---:|---|---|---|---|
| 1 | `20260709215237` | `initial_schema` | `202607100001_initial_schema.sql` | Strong semantic match; version differs |
| 2 | `20260709215547` | `harden_security_and_indexes` | `202607100002_harden_security_and_indexes.sql` | Strong semantic match; version differs |
| 3 | `20260718163355` | `letter_lifecycle` | `202607190001_rebuild_core.sql`; `202607190002_journal_functions.sql` | No one-to-one local file; lifecycle absorbed by the rebuilt model |
| 4 | `20260718163612` | `letter_assets_bookmarks` | `202607190003_interactions_and_storage.sql`; `202607260010_journal_letter_mood_star.sql` | Assets and bookmark/star behavior split across later local files |
| 5 | `20260718163638` | `scheduled_publication` | Core/future-entry definitions plus `202607270004_capsule_letter_limit.sql` | No one-to-one local file; final scheduling fields must come from the production schema snapshot |
| 6 | `20260718163705` | `event_reminder_cron` | No exact local file | Production-only historical entry; final jobs/extensions must be captured explicitly |
| 7 | `20260723142531` | `couple_diary_rebuild_core` | `202607190001_rebuild_core.sql` | Strong semantic match; version differs |
| 8 | `20260723142534` | `couple_diary_journal_functions` | `202607190002_journal_functions.sql` | Strong semantic match; version differs |
| 9 | `20260723142536` | `couple_diary_interactions_storage` | `202607190003_interactions_and_storage.sql` | Strong semantic match; version differs |
| 10 | `20260723151928` | `couple_diary_product_integration` | `202607190004_product_integration.sql` | Strong semantic match; version differs |
| 11 | `20260723153326` | `fix_open_future_diary_ambiguous_id` | `202607230001_fix_open_future_diary.sql` | Strong semantic match; version differs |
| 12 | `20260723161959` | `restore_future_diary_open_notification` | `202607230002_restore_future_diary_open_notification.sql` | Strong semantic match; version differs |
| 13 | `20260728035139` | `finalize_letter_notification_state` | `202607280009_finalize_letter_notification_state.sql` | Final-state match; version differs |
| 14 | `20260728111737` | `resolve_capsule_rpc_overload` | `20260728110538_resolve_capsule_rpc_overload.sql` | Final-state match; version differs |

## Local 42-file inventory

| # | Local migration | Area | v1.0.0 disposition |
|---:|---|---|---|
| 1 | `202607100001_initial_schema.sql` | Legacy initial model | Archive; final objects absorbed by baseline |
| 2 | `202607100002_harden_security_and_indexes.sql` | Legacy hardening | Archive; final constraints/indexes absorbed |
| 3 | `202607190001_rebuild_core.sql` | Couple-space core rebuild | Archive; final tables/types/RLS absorbed |
| 4 | `202607190002_journal_functions.sql` | Journal/capsule RPCs | Archive; only final RPC signatures absorbed |
| 5 | `202607190003_interactions_and_storage.sql` | Comments, annotations, storage | Archive; final objects and policies absorbed |
| 6 | `202607190004_product_integration.sql` | Mood/calendar/profile integration | Archive; final objects absorbed |
| 7 | `202607230001_fix_open_future_diary.sql` | Capsule RPC fix | Archive; superseded function body absorbed |
| 8 | `202607230002_restore_future_diary_open_notification.sql` | Capsule notification fix | Archive; final behavior absorbed |
| 9 | `202607250001_mood_edit_window.sql` | Mood rules | Archive; final RPC rules absorbed |
| 10 | `202607250002_independent_memories.sql` | Memories | Archive; final memory model absorbed |
| 11 | `202607260001_home_activity_and_location_history.sql` | Location/activity | Archive; final tables/functions/triggers absorbed |
| 12 | `202607260002_home_v7_rules.sql` | Home activity rules | Archive; superseded trigger bodies absorbed |
| 13 | `202607260003_notification_actor_hotfix.sql` | Notification hotfix | Archive; final columns/indexes absorbed |
| 14 | `202607260004_notification_enum_compat.sql` | Notification enum compatibility | Archive; intermediate compatibility step |
| 15 | `202607260005_backfill_inbox_letters.sql` | Data backfill | Archive; do not include production data in schema baseline |
| 16 | `202607260006_inbox_read_baseline.sql` | Notification data normalization | Archive; data repair is not schema baseline SQL |
| 17 | `202607260007_memory_tree_rules.sql` | Memory tree rules | Archive; superseded RPC body absorbed |
| 18 | `202607260008_memory_tree_v2.sql` | Memory tree v2 | Archive; final functions/triggers absorbed |
| 19 | `202607260009_journal_letter_v1.sql` | Letter lifecycle plus deletion system | Archive; final letter fields absorbed, deletion behavior excluded |
| 20 | `202607260010_journal_letter_mood_star.sql` | Letter star/mood | Archive; final fields/indexes/RPCs absorbed |
| 21 | `202607270001_fix_journal_rls.sql` | Journal RLS | Archive; final policies absorbed |
| 22 | `202607270002_journal_drafts.sql` | Drafts | Archive; final table/RPC definitions absorbed |
| 23 | `202607270003_drafts_and_comments_hardening.sql` | Draft/comment hardening | Archive; final constraints/triggers/RPCs absorbed |
| 24 | `202607270004_capsule_letter_limit.sql` | Capsule quota/state | Archive; final types/functions absorbed |
| 25 | `202607270005_fix_letter_classification.sql` | Letter classification | Archive; final domain predicates absorbed |
| 26 | `202607270006_comment_notifications.sql` | Comment notifications | Archive; final function bodies absorbed |
| 27 | `202607270006_fix_mood_notification_body.sql` | Mood notification fix | Archive; duplicate version; final body absorbed |
| 28 | `202607270007_couple_settings.sql` | Couple settings | Archive; final tables/policies absorbed |
| 29 | `202607270007_fix_draft_upsert_return_id.sql` | Draft RPC fix | Archive; duplicate version; final signature/body absorbed |
| 30 | `202607270008_couple_settings_functions.sql` | Couple settings RPCs | Archive; final RPCs and grants absorbed |
| 31 | `202607270009_profile_settings.sql` | Profile settings | Archive; final RPCs absorbed |
| 32 | `202607270010_partner_nickname_notification.sql` | Nickname notifications | Archive; final function body absorbed |
| 33 | `202607280001_fix_notification_types.sql` | Notification enum/function fix | Archive; intermediate state absorbed |
| 34 | `202607280002_notification_enum_fix.sql` | Notification enum rebuild | Archive; intermediate state absorbed |
| 35 | `202607280003_fix_history_notifications.sql` | Historical notification repair | Archive; data repair excluded from schema baseline |
| 36 | `202607280004_add_notification_metadata.sql` | Notification metadata | Archive; final column/functions absorbed |
| 37 | `202607280005_fix_notification_triggers.sql` | Notification trigger fix | Archive; final trigger bodies absorbed |
| 38 | `202607280006_split_recall_and_delete.sql` | Per-user deletion/recycle system | Archive as retired product logic; exclude its objects |
| 39 | `202607280007_notification_is_active.sql` | Active notification state | Archive; final column/default/functions absorbed |
| 40 | `202607280008_simplify_letters_and_notifications.sql` | Letter/notification simplification | Archive; final policies/functions absorbed |
| 41 | `202607280009_finalize_letter_notification_state.sql` | Final letter/notification state | Archive as final-state evidence; objects absorbed |
| 42 | `20260728110538_resolve_capsule_rpc_overload.sql` | Capsule RPC overload cleanup | Archive as final-state evidence; single signatures absorbed |

## Version collisions

The active local history contains two duplicate numeric versions:

- `202607270006_comment_notifications.sql`
- `202607270006_fix_mood_notification_body.sql`

and:

- `202607270007_couple_settings.sql`
- `202607270007_fix_draft_upsert_return_id.sql`

These collisions are one reason the 42-file directory must not be treated as a
reliable executable chain for a new environment.

## Interpretation rules

1. All 42 files remain historical evidence until separately archived.
2. “Absorbed” means the final object definition belongs in the baseline; it
   does not mean the old file should be replayed.
3. Data backfills are not copied into a schema-only baseline.
4. Retired deletion objects are intentionally absent from the final baseline.
5. The production migration table itself is not copied into a new environment.
