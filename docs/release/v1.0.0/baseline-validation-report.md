# v1.0.0 Schema Baseline Validation

Validation date: 2026-07-28

## Environment

- Disposable project: `NKDDiary-v1.0.0-baseline-test`
- Project ID: `dbsvxhtkqjlekjxzqalv`
- Region: `ap-southeast-1`
- Connection state at validation: `ACTIVE_HEALTHY`
- Production project was not connected to or modified.
- The disposable project is retained pending an explicit deletion decision.

## Final execution

The final candidate was executed once from a clean `public` schema after adding
explicit `service_role` privileges. It completed successfully in 58.6 seconds
with no SQL errors.

The baseline is self-contained for application-owned objects and does not rely
on the managed project's initial implicit `public` schema ACLs.

## Created objects

| Object class | Count |
| --- | ---: |
| Public tables | 19 |
| Public enums | 6 |
| Public functions | 78 |
| Public triggers | 25 |
| Public RLS policies | 31 |
| Public indexes | 52 |
| Public constraints | 108 |
| Storage object policies | 11 |

All 19 public tables have RLS enabled. The 12 core application tables were
present: `calendar_events`, `couple_setting_requests`, `journal_comments`,
`journal_drafts`, `journal_entries`, `location_history`, `memory_entries`,
`mood_entries`, `notifications`, `profiles`, `space_members`, and `spaces`.

The storage baseline contains the `avatars`, `journal-images`, and
`memory-images` buckets. All 19 public business tables contained zero rows after
initialization; no business or authentication data is included.

## Permission verification

The critical RPCs below are `SECURITY DEFINER`. Each is executable by
`service_role` and `authenticated`, and not executable by `anon`:

- `get_letter_withdrawal_status(uuid)`
- `mark_letter_read(uuid)`
- `open_future_diary(uuid)`
- `seal_future_diary(uuid, text, text, uuid, timestamptz, text)`
- `seal_future_diary_with_image(uuid, text, text, uuid, timestamptz, text, text)`
- `withdraw_letter_diary(uuid)`

`service_role` has explicit usage on the `public` schema, full privileges on
public tables and sequences, and execute privileges on public functions.
`authenticated` remains constrained by explicit grants and RLS. It may update
the `notifications.is_read` column but has no direct `notifications` insert
grant. `anon` has no execute privilege on the critical RPCs.

## Retired objects

- `letter_deletions` is absent.
- Retired delete, purge, and recycle-bin RPCs are absent.
- Historical `deleted_at` and `purge_at` columns remain for compatibility and
  do not restore the retired deletion workflow.

## Result

`v1.0.0_schema_baseline.sql` is an empty-project baseline candidate **PASS**.
No further rebuild, migration execution, production synchronization, or
database security expansion was performed after this verification.
