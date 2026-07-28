# v1.0.0 Schema Baseline Design

## Status

An offline schema baseline candidate has been generated at:

`supabase/baseline/v1.0.0_schema_baseline.sql`

It has not been executed, parsed by PostgreSQL, or compared with a disposable
empty database. Its status is **candidate**, not **validated baseline**.

The future baseline is intended for empty environments. It must not be applied
to the existing production database.

## Source of truth

The source of truth is the audited production schema at the v1.0.0 application
commit:

`dd161e2414f93d686780a314e45f998d445aa9bd`

Local pre-v1.0 migration files are supporting history, not an executable source
of truth.

## Baseline contents

### Platform and PostgreSQL prerequisites

- required PostgreSQL extensions
- required Supabase-managed integration assumptions
- custom enum and composite types
- schema ownership and safe search paths

Managed `auth` and internal Supabase schemas must not be recreated from an
application migration.

### Tables and relationships

The baseline inventory must be generated from production and include all
application-owned tables, including the final forms of:

- profiles
- spaces and space membership
- journal entries and drafts
- comments, annotations, and replies
- notifications
- moods
- memories
- calendar events
- location history
- couple setting requests
- application-owned cleanup/job metadata

For every table, capture:

- columns, types, nullability, and defaults
- primary and foreign keys
- unique and check constraints
- indexes
- identity/sequence dependencies

### Final letter domain

The baseline must encode:

- `entry_type='today' AND recipient_id IS NOT NULL` as a regular letter
- `entry_type='future' AND recipient_id IS NOT NULL` as a capsule letter
- `entry_type='today' AND recipient_id IS NULL` as legacy data, not a current
  personal-diary product
- `withdrawn_at IS NOT NULL` as withdrawn
- `opened_at` and `opened_by` as letter-read metadata
- no current deletion or recycle-bin lifecycle

Historical `deleted_at` and `purge_at` columns remain if they exist in
production, but no baseline RPC, trigger, or policy may treat them as a current
product workflow.

### Final notification domain

The baseline must include:

- `notifications.is_read NOT NULL DEFAULT false`
- `notifications.is_active NOT NULL DEFAULT true`
- recipient, actor, source, related-entry, metadata, and occurrence fields as
  present in production
- indexes supporting recipient and unread queries
- final notification enum values

The single unread predicate is:

`is_read=false AND is_active=true`

List retention/pagination rules are application concerns and must not alter the
global unread predicate.

### Functions and triggers

Capture only final signatures and bodies for:

- regular letter creation and withdrawal
- `mark_letter_read`
- `get_letter_withdrawal_status`
- capsule creation, image capsule creation, and explicit opening
- draft actions
- comment/reply actions
- mood, memory, calendar, profile, location, and couple-setting actions
- notification creation and synchronization
- immutable identity and updated-at triggers
- active-space/member constraints

For privileged functions:

- record `SECURITY DEFINER`/`SECURITY INVOKER`
- set a safe `search_path`
- revoke execution from `PUBLIC` and `anon` where required
- grant only intended roles
- verify internal `auth.uid()` and membership checks

### RLS and grants

For every exposed application table:

- enable RLS
- capture SELECT/INSERT/UPDATE/DELETE policies
- capture both `USING` and `WITH CHECK` where relevant
- verify policies restrict rows by user/space relationship
- capture Data API grants separately from row-level authorization

### Storage

Capture:

- required bucket definitions
- private/public status
- object path ownership conventions
- SELECT/INSERT/UPDATE/DELETE policies
- signed URL assumptions

Do not include stored user objects.

### Scheduled jobs

Inventory and explicitly decide whether to include:

- event reminder jobs
- capsule publication/open jobs
- image cleanup jobs
- required extensions and schedules

Job definitions must be environment-safe and must not embed production IDs,
URLs, credentials, or user data.

## Exclusions

The baseline must not contain:

- application user data
- Supabase Auth users or sessions
- UUIDs from production
- email addresses or passwords
- letter/comment/memory/mood content
- location records
- notification rows
- Storage objects
- service-role or secret keys
- production migration-history rows
- deletion/recycle-bin objects
- environment-specific webhook secrets

## Artifact design

The baseline release work should produce:

- the current offline schema-only candidate
- after separate approval, a reviewed active migration created with a unique
  Supabase CLI version
- a schema object inventory
- production-versus-baseline schema fingerprints
- a migration history map
- an archive manifest with SHA-256 for all 42 historical SQL files
- a validation report from a disposable empty environment

The SQL must be reviewed before it is committed or executed.

## Primary risks requiring approval

1. A schema dump may omit or reorder Storage, cron, grants, or privileged
   function details.
2. A raw dump can contain environment-specific owners or settings.
3. Replaying historical migrations can temporarily recreate retired objects.
4. Applying the baseline to production would collide with existing objects and
   migration history.
5. Marking a baseline as applied without schema equivalence would create false
   recovery confidence.

For these reasons, baseline SQL generation is a separate, confirm-before-action
stage.
