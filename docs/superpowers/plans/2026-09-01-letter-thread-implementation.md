# Letter Thread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backward-compatible letter threads, replies, withdrawn resends, secure thread reads, and notification navigation without exposing withdrawn or sealed content.

**Architecture:** `journal_entries.thread_id` points to the root journal row; `reply_to_id` points to the direct parent. Modern historical rows become one-row threads. Narrow `SECURITY DEFINER` RPCs own writes and viewer-specific redaction; no thread, root, or summary table is added.

**Tech Stack:** PostgreSQL/Supabase RLS and RPC, Next.js 16, TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-phase2-batch0-batch1-domain-design.md`

## Global Constraints

- Production writes and Production migration are forbidden during implementation validation.
- `today + recipient_id IS NULL` remains legacy and never enters a thread.
- Historical relationships are never inferred from participants, title, timestamps, or proximity.
- Withdrawn recipient content and sealed capsule content must never leave the database boundary.
- Existing notification unread contract remains `recipient_id = auth.uid() AND is_read = false AND is_active = true`.
- Database migration deploys before thread-aware frontend.

---

## Schema SQL design

Migration A runs in a transaction. Constraints are added `NOT VALID` because existing rows need backfill before validation.

```sql
begin;

alter table public.journal_entries
  add column if not exists thread_id uuid,
  add column if not exists reply_to_id uuid;

alter table public.journal_entries
  add constraint journal_entries_thread_id_fkey
  foreign key (thread_id) references public.journal_entries(id)
  on delete restrict not valid,
  add constraint journal_entries_reply_to_id_fkey
  foreign key (reply_to_id) references public.journal_entries(id)
  on delete restrict not valid,
  add constraint journal_entries_reply_not_self_check
  check (reply_to_id is null or reply_to_id <> id) not valid,
  add constraint journal_entries_thread_shape_check
  check (
    (entry_type = 'today' and recipient_id is null
      and thread_id is null and reply_to_id is null)
    or
    (recipient_id is not null and reply_to_id is null
      and entry_type in ('today', 'future') and thread_id = id)
    or
    (recipient_id is not null and reply_to_id is not null
      and entry_type = 'today' and thread_id is not null)
  ) not valid;

commit;
```

Backfill is intentionally outside one large transaction. Repeat bounded batches until zero rows remain:

```sql
with batch as (
  select id
  from public.journal_entries
  where recipient_id is not null
    and entry_type in ('today', 'future')
    and thread_id is null
  order by id
  limit 1000
  for update skip locked
)
update public.journal_entries as entry
set thread_id = entry.id,
    reply_to_id = null
from batch
where entry.id = batch.id;
```

Post-backfill preflight must return zero:

```sql
select count(*)
from public.journal_entries
where recipient_id is not null
  and entry_type in ('today', 'future')
  and (thread_id is distinct from id or reply_to_id is not null);

select count(*)
from public.journal_entries
where entry_type = 'today' and recipient_id is null
  and (thread_id is not null or reply_to_id is not null);
```

Migration B validates after backfill:

```sql
alter table public.journal_entries validate constraint journal_entries_thread_id_fkey;
alter table public.journal_entries validate constraint journal_entries_reply_to_id_fkey;
alter table public.journal_entries validate constraint journal_entries_reply_not_self_check;
alter table public.journal_entries validate constraint journal_entries_thread_shape_check;
```

Migration C updates `preserve_journal_entry_immutability()` so any change to `thread_id` or `reply_to_id` raises `journal entry thread identity is immutable` with SQLSTATE `23514`.

Indexes run as standalone statements because PostgreSQL forbids `CONCURRENTLY` inside a transaction:

```sql
create index concurrently if not exists journal_entries_thread_timeline_idx
on public.journal_entries(space_id, thread_id, published_at, id)
where thread_id is not null;

create index concurrently if not exists journal_entries_reply_to_id_idx
on public.journal_entries(reply_to_id)
where reply_to_id is not null;
```

## RPC specifications

All new RPCs use `SECURITY DEFINER`, `SET search_path = ''`, explicit column projection, `REVOKE EXECUTE ... FROM PUBLIC, anon, service_role`, and `GRANT EXECUTE ... TO authenticated`. Service-role fixtures write directly; user RPCs still require a real `auth.uid()`.

### Existing RPC delta

- `create_letter_diary`: MODIFY. Generate `v_id := gen_random_uuid()`; insert `id=v_id, thread_id=v_id, reply_to_id=null`; retain validation, notification trigger, quota behavior, signature, and return UUID.
- `seal_future_diary`: MODIFY. Generate `v_id`; insert root fields in the same statement; retain capsule quota, recipient validation, dates, signature, and row return.
- `open_future_diary`: KEEP. Existing target row lock, membership, recipient, and `open_at` checks are sufficient.
- `mark_letter_read`: KEEP for compatibility. Thread detail gets a separate batch read operation.
- `withdraw_letter_diary`: KEEP. Existing conditional update remains the reply/read race boundary.

### `reply_to_letter`

```sql
public.reply_to_letter(
  p_target_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
) returns uuid
```

Lock target first by primary key `FOR UPDATE`. Reject unauthenticated (`28000`), missing/outsider/cross-space/inactive (`42501`), withdrawn (`55000`), unopened capsule (`55000`), malformed content (`22023`). Caller must equal target recipient. Root `id=target.thread_id` must share target space and participants. In the same transaction: mark the active target opened when caller is recipient; mark its active notifications read; insert one ordinary row with a generated ID, inherited thread, direct parent, opposite recipient; return the new ID. The existing insert trigger creates the reply notification with `source_id=new.id`.

### `resend_withdrawn_letter`

```sql
public.resend_withdrawn_letter(
  p_withdrawn_id uuid,
  p_rich_content jsonb,
  p_plain_text text,
  p_stationery_theme text,
  p_mood_emoji text default null
) returns uuid
```

Lock withdrawn row `FOR UPDATE`. Caller must be author, active member, row must be ordinary and withdrawn. Reject if any row already has `reply_to_id=p_withdrawn_id AND author_id=auth.uid()` (`23505`). Insert new ordinary row in the same thread with `reply_to_id=p_withdrawn_id`; never update original. The `reply_to_id` index supports exactly-once lookup. Trigger creates notification.

### `list_letter_threads`

```sql
public.list_letter_threads(
  p_limit integer default 30,
  p_before_activity_at timestamptz default null,
  p_before_thread_id uuid default null
) returns table (
  thread_id uuid,
  counterpart_id uuid,
  latest_activity_at timestamptz,
  latest_letter_id uuid,
  latest_preview text,
  letter_count bigint,
  origin_type public.journal_entry_type,
  root_open_at timestamptz,
  root_opened_at timestamptz,
  latest_withdrawn boolean,
  unread boolean
)
```

Resolve exactly one active space. Candidate rows require modern classification and caller participation. Aggregate all rows, including withdrawn. `latest_activity_at=max(greatest(published_at, coalesce(withdrawn_at, '-infinity')))`. Root comes from `id=thread_id`. Latest row uses `ORDER BY activity_at DESC, id DESC`. Recipient preview for withdrawn latest is fixed text; sender may receive excerpt only. Sealed capsule recipient preview is fixed metadata. `unread` uses an `EXISTS` join to active unread notifications whose `source_id` belongs to the thread. Cursor predicate is `(latest_activity_at, thread_id) < (...)`. Final order is `latest_activity_at DESC, thread_id DESC`.

### `get_letter_thread_detail`

```sql
public.get_letter_thread_detail(p_thread_id uuid)
returns table (
  thread_id uuid,
  letter_id uuid,
  reply_to_id uuid,
  author_id uuid,
  recipient_id uuid,
  entry_type public.journal_entry_type,
  published_at timestamptz,
  open_at timestamptz,
  opened_at timestamptz,
  withdrawn_at timestamptz,
  body_visible boolean,
  title text,
  rich_content jsonb,
  plain_text text,
  excerpt text,
  stationery_theme text,
  mood_emoji text,
  image_path text,
  reply_allowed boolean,
  resend_allowed boolean,
  thread_count bigint
)
```

Resolve root and active membership without revealing whether an outsider thread exists. Lock only active incoming ordinary rows that will be shown, ordered by `id`, then set their `opened_at/opened_by` and matching active notifications `is_read=true` in the same transaction. Never mark a future row; only `open_future_diary` opens capsules. Return rows `ORDER BY published_at ASC, id ASC`. Recipient withdrawn rows return identifiers/state plus all body columns NULL. Recipient sealed capsule rows return identifiers, `open_at`, and state only; all body/image columns NULL. Sender receives own withdrawn body. `reply_allowed` is false for withdrawn and unopened capsule rows. `resend_allowed` is true only for withdrawn ordinary rows authored by caller with no existing resend child.

### `resolve_letter_notification_target`

```sql
public.resolve_letter_notification_target(p_notification_id uuid)
returns table(thread_id uuid, letter_id uuid)
```

Necessary because a recipient cannot SELECT a withdrawn source row through RLS. Require notification recipient `auth.uid()` and `is_active=true`; join source entry inside the definer function; return `coalesce(entry.thread_id, entry.id), entry.id`. Read state is intentionally ignored. Inactive notification returns no row.

## Lock order

1. Lock one target/root journal row by UUID.
2. Lock additional journal rows in ascending UUID order.
3. Update journal rows.
4. Update notifications.
5. Insert new journal row; insert trigger creates notification.

`reply_to_letter` marks target read before insert, so a later withdrawal fails. A completed withdrawal makes reply fail. Capsule open and reply serialize on the same target. Simultaneous legitimate replies both succeed and sort by `(published_at,id)`. Resend serializes on the withdrawn row; second call observes the first child and fails.

## Tasks

### Task 1: Schema and backfill tests

**Files:** Create one generated migration and `supabase/tests/letter_thread_migration.sql`.

- [ ] Write SQL tests asserting modern roots, legacy NULLs, withdrawn roots, FK rejection, self-reply rejection, and immutable thread fields.
- [ ] Run against isolated Test/shadow schema; confirm RED because columns are absent.
- [ ] Add Migration A, batched backfill runner, Migration B, immutability delta, and standalone concurrent indexes exactly as specified above.
- [ ] Re-run SQL tests; confirm GREEN and zero postflight violations.

### Task 2: Root creation contracts

**Files:** Modify generated migration RPC definitions and existing RPC contract tests.

- [ ] Add failing tests proving ordinary and capsule roots return `thread_id=id, reply_to_id=null` in one insert.
- [ ] Modify only `create_letter_diary` and `seal_future_diary`.
- [ ] Run targeted SQL/TypeScript tests; confirm GREEN.

### Task 3: Reply and resend writes

**Files:** Same generated migration; add `supabase/tests/letter_thread_writes.sql`; modify `src/features/journal/letter-actions.ts` only after DB tests pass.

- [ ] Add RED tests for ordinary reply, opened capsule reply, unopened capsule rejection, withdrawn reply rejection, cross-space/inactive rejection, one resend, immutable original, resend race, reply/withdraw race, and two legitimate simultaneous replies.
- [ ] Add the two RPCs with the signatures, locks, checks, notifications, ACLs, and SQLSTATEs above.
- [ ] Confirm SQL tests GREEN before adding thin server-action wrappers.

### Task 4: Secure thread reads

**Files:** Same migration; create `src/features/journal/thread-repository.ts` and tests.

- [ ] Add RED tests for one-row-per-thread, count including withdrawn, deterministic ordering, capsule origin, sender body visibility, recipient withdrawn redaction, sealed capsule redaction, outsider/cross-space rejection, and thread read marking.
- [ ] Add list/detail RPCs with explicit return columns; never `SELECT *`.
- [ ] Add repository mapping only; no client-side security filtering.
- [ ] Confirm SQL and repository tests GREEN.

### Task 5: Notification target resolution

**Files:** Same migration; modify `src/features/notifications/target.ts`, notification actions, and tests.

- [ ] Add RED tests proving active read notification remains navigable, historical source falls back to its own ID, inactive notification returns no target, and account isolation holds.
- [ ] Add resolver RPC and map result to `{type:'letter_thread',threadId,letterId}`.
- [ ] Confirm notification tests GREEN without changing badge queries.

### Task 6: Preview and full gate

**Files:** No production UI in this phase; create only isolated validation fixtures if needed.

- [ ] Run migration preflight/postflight on Test/shadow only.
- [ ] Run SQL concurrency scripts repeatedly.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] Run guarded full write E2E against Test Supabase; verify marker residue zero.
- [ ] Record `EXPLAIN (ANALYZE, BUFFERS)` for thread list/detail on Test data before accepting indexes.

## Rollout and rollback

1. Deploy backward-compatible DB migration first.
2. Verify old frontend still sends/reads per-letter flows.
3. Deploy Preview server actions/repositories, then thread UI in a later approved batch.
4. Deploy Production frontend only after Preview gates pass.

New frontend cannot run against old schema; DB must lead. Old frontend works against new schema because RPC signatures remain and root metadata is additive.

Pre-feature rollback may restore old RPC bodies and keep nullable columns. After any reply data exists, never drop columns or reply rows. Operational rollback disables new actions/UI, restores per-letter reader, preserves thread metadata and replies.
