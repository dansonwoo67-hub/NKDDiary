# Phase 2 Batch 3 Data Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and execute each task with RED → GREEN → focused regression.

**Goal:** Implement only the conditionally approved Batch 3 correctness fixes and restore RPC 011 on the isolated Test Supabase project.

**Architecture:** A shared pure comparator owns Memory ordering. Client-side submission owns a synchronous lock and success callback. Existing date-domain helpers become the single entry for audited high-risk UTC+8 paths. RPC 011 is restored by an additive forward migration copied from the tested baseline contract and verified only on Test.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Playwright, PostgreSQL/Supabase.

**Spec:** `docs/phase2/batch3-data-correctness-design.md`

## Global Constraints

- Production is read-only and must not receive migration or RPC execution.
- RPC Test target is exactly `dhznooibxcnpioqwnicy`.
- Do not modify Title logic; Title-specific failure remains unresolved.
- Memory order is exactly `occurredAt DESC → createdAt DESC → deterministic kind/id fallback`.
- Keep the approved atomic Withdrawal contract unchanged.
- Do not implement Letter Thread, Memory V2, homepage redesign, performance work, notification redesign, or unrelated refactors.

---

### Task 1: Memory correctness (002, 005, 006, 007)

**Files:**
- Modify: `src/features/memories/domain.ts`
- Modify: `src/features/memories/domain.test.ts`
- Modify: `src/features/memories/repository.ts`
- Modify: `src/features/memories/repository.test.ts`
- Modify: `src/features/home/repository.ts`
- Modify: `src/features/home/repository.test.ts`
- Modify: `src/features/memories/components/MemoryComposer.tsx`
- Modify: `src/features/memories/components/MemoryComposer.test.tsx`
- Modify: `src/features/memories/components/MemoryTimeline.tsx`
- Modify: `src/features/memories/components/MemoryTimeline.test.tsx`

**Produces:** one exported comparator; modal success-close callback; same-tick duplicate-submit lock.

- [ ] Add failing comparator tests covering occurredAt, createdAt, and deterministic kind/id ties.
- [ ] Add failing repository/home tests proving both consumers use the same order.
- [ ] Add failing component tests proving two synchronous submits invoke one mutation and success closes the modal.
- [ ] Run focused RED tests and record expected failures.
- [ ] Implement the smallest comparator, callback, and synchronous ref lock; do not touch Title validation.
- [ ] Run focused GREEN tests and related Memory regressions.

### Task 2: Audited Relationship Date paths

**Files:**
- Modify: `src/lib/date/china-day.ts`
- Modify: `src/lib/date/china-day.test.ts`
- Modify: `src/lib/date/relationship-days.ts`
- Modify: `src/lib/date/relationship-days.test.ts`
- Modify only proven high-risk direct date consumers and their existing tests.

**Produces:** high-risk UI date calculations routed through `src/lib/date/relationship-date.ts` without mass string replacement.

- [ ] Audit current direct UTC/Asia-Shanghai conversions in active Home, Calendar, Journal, Notification, and Memory paths.
- [ ] Add failing boundary tests for UTC+8 00:00, 23:59, month/year rollover, and UTC previous-day/Taipei next-day.
- [ ] Run focused RED tests.
- [ ] Delegate legacy helpers and only proven active high-risk consumers to the relationship date domain.
- [ ] Run focused GREEN tests and relevant feature regressions.

### Task 3: RPC 011 Test-only forward migration

**Files:**
- Create: `supabase/migrations/<timestamp>_restore_create_couple_setting_request_rpc.sql`
- Create: `supabase/tests/create_couple_setting_request_rpc.sql`
- Update: `docs/phase2/batch3-data-correctness-design.md`

**Produces:** exact signature `create_couple_setting_request(setting_request_type,text,text)`, return `couple_setting_requests`, SECURITY DEFINER with empty search_path, active-membership enforcement, explicit grants.

- [ ] Audit the baseline body and every referenced enum/table/column/function.
- [ ] Add a Test SQL regression that fails while anon still has EXECUTE and covers authorized/unauthorized calls in a transaction.
- [ ] Run Test-only RED regression.
- [ ] Generate the forward migration using the repository migration command; restore the baseline implementation, revoke PUBLIC/anon, grant authenticated/service_role, and make no table/RLS changes.
- [ ] Guard the project ref and apply the exact SQL file only to `dhznooibxcnpioqwnicy`.
- [ ] Run Test-only GREEN regression and metadata postflight for signature, return, security, search_path, and permissions.
- [ ] Document rollback and Production preflight; do not apply Production.

### Task 4: Batch Gate verification

**Files:** no product changes expected.

- [ ] Run focused Withdrawal regression without widening its implementation.
- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:e2e` against the guarded Test project.
- [ ] Confirm Production remains untouched and STOP with the required Gate report.
