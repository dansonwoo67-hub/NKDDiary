# NKDDiary Phase 2 — Batch 3 Data Correctness Design

## Audit boundary

This design is based on repository evidence and read-only inspection of the
isolated Supabase test project `dhznooibxcnpioqwnicy`. Production was not
queried or changed. Existing Batch 0–2 workspace changes remain untouched.

## 002 — Memory modal remains open

- Root cause: `MemoryComposer` owns the successful action result, while
  `MemoryTimeline` owns `showComposer`. No success callback crosses that
  boundary, so successful reset cannot close the parent modal.
- Minimal fix: add an optional `onCreated` callback and invoke it only after an
  `ok` action result; parent sets `showComposer` false.
- Affected files: `MemoryComposer.tsx`, `MemoryTimeline.tsx`, focused component
  tests.
- Regression test: successful create closes modal; failed create keeps it open
  and preserves input.
- DB/RLS/RPC impact: none.
- Out of scope: Memory V2 UI or mutation refresh redesign.

## 005 + 007 — Memory chronology

- Root cause: `listMemories()` sorts the combined feed by raw `occurredAt`, but
  `buildHomeOverview()` sorts the same items again by `createdAt` with
  `occurredAt` fallback. The two surfaces therefore implement different
  chronology contracts. Both comparators return zero for equal timestamps, so
  order depends on upstream query/insertion order. Timeline grouping sorts date
  keys but preserves this unstable within-day order. Display formatting is not
  used for sorting.
- Data distinction: legacy memories use `occurred_on` for chronology and
  `created_at` for creation time; legacy moods use `created_at` for both.
- Minimal fix: one comparator over raw timestamps: `occurredAt DESC`, then
  `createdAt DESC` where available, then stable `kind/id` key. Use it in feed
  construction and Home overview; do not rewrite repositories.
- Affected files: memory domain/repository, Home repository, focused tests.
- Regression tests: Home and Memories order match; legacy mood and memory mix;
  identical primary timestamps remain deterministic.
- DB/RLS/RPC impact: none.
- Out of scope: removing calendar compatibility items or Memory V2.

## 006 — Memory create reliability

- Proven root causes: success feedback stays inside a modal that never closes;
  no synchronous submission latch exists before React exposes transition
  pending state, so two same-tick submit events can call the action twice.
- Title status: controlled Preview/Test-Supabase reproduction covered empty,
  ordinary Chinese, apostrophe/ampersand, 30 ASCII characters, 30 CJK
  characters, and 15 emoji (30 UTF-16 units). Every server action returned
  success, created exactly one row, and every direct RPC returned data with no
  Supabase error. Title-specific failure is therefore unresolved, not a basis
  for code changes.
- Minimal proven fix: synchronous in-flight guard plus existing disabled/pending
  UI; retain success message semantics through the parent close transition;
  preserve form state on error.
- Affected files: `MemoryComposer.tsx` and component/action tests.
- Regression tests: one action call for repeated submit; success callback and
  reset; error preserves fields; current valid/default title contract.
- DB/RLS/RPC impact: none for proven fixes.
- Out of scope: server idempotency unless integration evidence proves UI lock is
  insufficient.

## 011 — Space rename

- Proven root cause: every settings action returns `error.message` directly, so
  PostgREST/RPC details reach the UI. The UI calls
  `create_couple_setting_request(p_setting_type, p_current_value,
  p_proposed_value)`.
- Test-environment evidence before the forward migration: that exact RPC
  existed, returned `couple_setting_requests`, was `SECURITY DEFINER`, and
  inherited execution for `anon`, `authenticated`, and `service_role`; its
  baseline body enforced active membership.
- Production read-only metadata evidence: no `public.create_couple_setting_request`
  row exists in `pg_proc`. The root cause is schema drift/function absence, not
  an application parameter mismatch. No RPC was executed and no business table
  was read.
- Approved forward proposal: restore the exact v1.0.0 baseline implementation
  at `create_couple_setting_request(setting_request_type,text,text)`, returning
  `couple_setting_requests`. Keep `SECURITY DEFINER` with `search_path = ''` and
  the baseline active `space_members` lookup. No second implementation exists.
- Permission contract: `anon`/`PUBLIC` do not require EXECUTE because the body
  requires a non-null `auth.uid()` and active membership. EXECUTE is explicit
  only for `authenticated` and `service_role`.
- Dependencies audited from the baseline body: `setting_request_type`,
  `couple_setting_requests`, `space_members`, `profiles`, `notifications`,
  `auth.uid()`, and the `space_setting_request` notification enum/value.
- DB/RLS impact: one function definition plus function grants only. No table,
  column, trigger, policy, RLS, storage, or data change.
- Test-only result: forward SQL was applied to `dhznooibxcnpioqwnicy`; signature,
  composite return, `SECURITY DEFINER`, empty search path, role grants,
  authorized member flow, and non-member rejection passed in a rolled-back
  transaction. Production remains absent and untouched.
- Rollback: if a separately approved Production application fails before any
  consumer depends on the restored RPC, drop only the exact signature
  `public.create_couple_setting_request(public.setting_request_type,text,text)`.
  Do not roll back tables, policies, or data because this proposal changes none.
- Production preflight: re-confirm the function is absent and no overload exists;
  confirm every dependency above and the composite return type; confirm the
  notification type accepts `space_setting_request`; capture current function
  metadata if drift appears; confirm `authenticated`/`service_role` roles exist;
  run the authorized/non-member transaction regression in a non-Production clone;
  then require a separate Production Migration Gate.
- Out of scope: creating a second rename RPC or bypassing mutual confirmation.

## Relationship Date

- Root cause: Batch 1 established `Asia/Taipei` helpers, but high-risk paths
  still use three local contracts: `china-day`, `relationship-days`, and inline
  `Asia/Shanghai` formatters. `MemoryTimeline` also initializes the create date
  with UTC `toISOString().slice(0, 10)`, which is wrong around UTC+8 midnight.
- Minimal migration: replace only high-risk today/date formatting call sites
  with existing Relationship Date APIs; add a narrow helper only where the
  existing API cannot express the operation. Do not mechanically replace zone
  strings.
- Candidate paths: Home today, Memory grouping/display/create default, Journal
  display/comparison, Notification display, Calendar comparisons, capsule day
  boundary, relationship-day calculation.
- Tests: UTC+8 midnight/end-of-day, month/year boundaries, Taipei-next-day while
  UTC remains previous day, identical timestamp stable sort.
- DB impact: none. DB remains UTC/timestamptz.
- Out of scope: historical SQL timezone string rewrites.

## Letter withdrawal foundation

- Root cause: current `withdraw_letter_diary` atomically checks author,
  `withdrawn_at`, and 24-hour `locked_at`, but does not check `opened_at`.
  Therefore a read letter can still be withdrawn. The current action maps every
  database failure to the 24-hour message.
- Race: `mark_letter_read` and withdrawal are separate atomic updates. Adding
  `opened_at is null` to the withdrawal update makes the winner deterministic;
  no application-side select-then-update is allowed.
- Minimal fix: revise the existing RPC, not add a second RPC. Atomic update must
  require ordinary letter type, author, `opened_at is null`,
  `withdrawn_at is null`, and current withdrawal window. Return or map a bounded
  result contract for success, already-read, already-withdrawn, unauthorized,
  and not-found. Keep notification deactivation in the same transaction.
- Capsule rule: `future` entries must remain non-withdrawable.
- Affected files: one new forward migration proposal, letter action/result
  mapping, regression and isolated-test integration tests.
- DB impact: existing RPC definition changes; no table/column/RLS change.
- Production impact: no SQL may be applied without separate approval.
- Out of scope: thread UI, resend, edit-after-withdrawal, notification changes.

## Caveman review gate

Review result: **Conditional Gate scope implemented; Production Migration Gate
remains STOP**.

Reasons:

1. Issue 006 title-specific failure did not reproduce and remains unresolved;
   Title logic was not changed. Modal-close and duplicate-submit received focused
   TDD fixes.
2. Issue 011 forward migration restores the tested baseline contract and passed
   only on Test. It is not authorized for Production.
3. Withdrawal forward migration
   `20260829204230_enforce_unread_letter_withdrawal.sql` was applied only to the
   Test project. Transactional regression and real concurrent read/withdraw
   verification passed. Production remains unchanged.

Rejected approaches:

- broad Memory repository rewrite;
- global `Asia/Shanghai` string replacement;
- server idempotency system before UI-lock evidence;
- new Space rename RPC;
- application-side read-then-withdraw;
- changing capsule or notification contracts.
