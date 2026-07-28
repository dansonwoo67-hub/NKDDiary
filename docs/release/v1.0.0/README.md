# NKDDiary v1.0.0 Database Release Baseline

## Scope

This directory records the database release baseline for application commit
`dd161e2414f93d686780a314e45f998d445aa9bd`.

The release materials include an offline-generated schema baseline candidate at
`supabase/baseline/v1.0.0_schema_baseline.sql`. It passed execution and
permission verification in an approved disposable empty project. This does not
authorize applying SQL to production.

## Evidence boundary

- Production migration history: 14 entries, captured by the read-only release
  audit on 2026-07-28.
- Local migration history: 42 SQL files under `supabase/migrations`.
- Production schema: the current production database is the v1.0.0 schema
  source of truth.
- User data, authentication identities, UUIDs, message bodies, comments,
  location history, and secrets are outside this baseline.

## Documents

- [Migration history map](./migration-history-map.md)
- [Deprecated migration inventory](./deprecated-migrations.md)
- [Schema baseline design](./schema-baseline-design.md)
- [Empty database validation plan](./empty-database-validation-plan.md)
- [Baseline validation report](./baseline-validation-report.md)

## Release rule

The v1.0.0 baseline candidate must never be replayed against the existing
production database. It may be used only for an approved disposable empty
environment validation after separate review.
