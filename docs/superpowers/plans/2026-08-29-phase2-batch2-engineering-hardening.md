# NKDDiary Phase 2 Batch 2 Engineering Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TypeScript pass and prove the complete write-capable Playwright suite can run only against the isolated Supabase project `dhznooibxcnpioqwnicy`.

**Architecture:** Keep all product and database contracts unchanged. Repair stale test fixtures at their test boundary, then add one pure fail-closed E2E environment guard used by both the custom runner and Playwright global setup. Load a dedicated ignored environment file, seed synthetic users in the isolated project, and scope all write cleanup by E2E identity and marker.

**Tech Stack:** Next.js 16, React 19, TypeScript 5/ES2017, Vitest 4, Playwright 1.61, Supabase Auth/PostgreSQL/Storage.

**Spec:** `docs/phase2/batch2-engineering-hardening-design.md`

## Global Constraints

- Do not change product behavior, Production data, schema, migrations, RLS, RPCs, or `tsconfig.json` strictness/target.
- Preserve all pre-existing workspace changes, especially `next-env.d.ts` and Batch 1 work.
- `.env.e2e.local` is untracked and is the only environment file loaded by write-capable E2E.
- Never print credentials, keys, passwords, or complete environment values.
- The only allowed write target is Supabase project ref `dhznooibxcnpioqwnicy`.
- Stop after Batch 2 verification and wait for Gate Review.

---

### Task 1: Repair `requireUser` test contracts

**Files:**
- Modify: `src/app/(app)/journal/[id]/page.test.tsx`
- Modify: `src/app/(app)/journal/future/new/page.test.tsx`
- Modify: `src/app/(app)/journal/future/page.test.tsx`
- Modify: `src/features/journal/actions.test.ts`
- Modify: `src/features/media/actions.test.ts`

**Interfaces:**
- Consumes: `requireUser(): Promise<{ userId; profile; spaceId; email }>`.
- Produces: type-correct mocks without changing the production API.

- [ ] Record the five missing-email failures from `npx tsc --noEmit --pretty false`.
- [ ] Add a non-sensitive `email: "user@example.test"` to each mocked `requireUser` result.
- [ ] Run the five focused Vitest files and require PASS.
- [ ] Run `npx tsc --noEmit --pretty false` and record the reduced error count.

### Task 2: Repair JournalEntry fixtures

**Files:**
- Create or reuse: `src/features/journal/test-fixtures.ts`
- Modify: `src/features/journal/reader-data.test.ts`
- Modify: `src/features/media/actions.test.ts`

**Interfaces:**
- Consumes: production `JournalEntry` type.
- Produces: `createJournalEntryFixture(overrides?: Partial<JournalEntry>): JournalEntry` with complete defaults.

- [ ] Add a compile-time usage in the affected tests that fails while the helper is absent.
- [ ] Run the focused typecheck and confirm the expected missing-helper/incomplete-shape failure.
- [ ] Implement the complete typed factory using inert test values and no `any`.
- [ ] Replace both incomplete object literals with the factory.
- [ ] Run journal reader/media tests and require PASS.
- [ ] Run typecheck and record the remaining count.

### Task 3: Repair memory and route/ES2017 test contracts

**Files:**
- Modify: `src/features/memories/repository.test.ts`
- Modify: `src/features/home/navigation.test.ts`
- Modify: `supabase/migrations/202607190002_journal_functions.test.ts`
- Modify: `supabase/migrations/202607190003_interactions_and_storage.test.ts`

**Interfaces:**
- Consumes: current repository row types, current navigation literals, ES2017 RegExp support.
- Produces: complete fixtures and semantically equivalent ES2017 assertions.

- [ ] Add the missing author/creator snapshot fields to every repository fixture.
- [ ] Replace the impossible route literal comparison with an assertion that the route collection excludes `/mood`.
- [ ] Replace dotAll `/s` patterns with `[\s\S]` while preserving SQL contract intent.
- [ ] Run the four focused suites and require PASS.
- [ ] Run `npx tsc --noEmit --pretty false` and require zero errors before E2E infrastructure work.

### Task 4: Build the production write guard using TDD

**Files:**
- Create: `scripts/e2e-environment-guard.ts`
- Create: `scripts/e2e-environment-guard.test.ts`

**Interfaces:**
- Produces: `parseSupabaseProjectRef(url: string): string | null`, `validateWriteCapableE2eEnvironment(environment): GuardResult`, and `assertWriteCapableE2eEnvironment(environment): GuardResult`.
- `GuardResult` exposes only `{ projectRef: "dhznooibxcnpioqwnicy"; production: false }`.

- [ ] Write eight unit cases: valid test target; Production target; missing flag; Production despite flag; allowlist mismatch; malformed URL; missing service role; allowlist/denylist conflict.
- [ ] Run `npx vitest run scripts/e2e-environment-guard.test.ts` and verify RED because the guard does not exist.
- [ ] Implement URL parsing and ordered fail-closed validation without logging secret values.
- [ ] Run the guard suite and require all eight cases PASS.
- [ ] Run typecheck and lint on the new files.

### Task 5: Load only `.env.e2e.local` and integrate both guards

**Files:**
- Modify: `scripts/playwright-e2e-config.ts`
- Modify: `scripts/playwright-e2e-config.test.ts`
- Modify: `scripts/run-playwright-e2e.ts`
- Create: `scripts/playwright-global-setup.ts`
- Modify: `playwright.config.ts`
- Create: `.env.e2e.local.example`

**Interfaces:**
- Produces: `loadE2eEnv(cwd): void`, runner pre-start guard, and Playwright global guard.
- Consumes: Task 4 assertion.

- [ ] Write tests proving `.env.e2e.local` loads, `.env.local` is ignored, and existing process values are not overwritten.
- [ ] Run the config suite and verify RED against the current `.env.local` loader.
- [ ] Implement the dedicated loader and remove write-suite fallback to `.env.local`.
- [ ] Call the guard before `findAvailablePort()` or `startServer()`.
- [ ] Add Playwright global setup that calls the same assertion before suites load.
- [ ] Add the example environment file with names and explanatory placeholders only.
- [ ] Run config, guard, typecheck, and lint checks.

### Task 6: Prepare the isolated Supabase fixture

**Files:**
- Modify as required: `scripts/seed-couple-users.ts`
- Modify as required: `scripts/seed-couple-users.test.ts`
- Create locally only: `.env.e2e.local`

**Interfaces:**
- Consumes: validated environment and project ref `dhznooibxcnpioqwnicy`.
- Produces: two synthetic Auth users, one dedicated space, and two memberships in the test project only.

- [ ] Verify current Supabase documentation/changelog relevant to Auth admin and service-role usage.
- [ ] Add a failing test proving seed execution rejects an unguarded or Production environment.
- [ ] Run the seed suite and verify RED.
- [ ] Integrate the shared guard before creating the service client.
- [ ] Populate `.env.e2e.local` without printing values and verify its parsed project ref is `dhznooibxcnpioqwnicy`.
- [ ] Run the idempotent seed against the isolated project and report only user count, space readiness, and project ref.
- [ ] Re-run seed tests and typecheck.

### Task 7: Harden marker-scoped E2E cleanup

**Files:**
- Modify: `tests/e2e/future-diary.spec.ts`
- Test: focused E2E infrastructure/unit tests as appropriate.

**Interfaces:**
- Consumes: validated test environment, dedicated test user IDs, unique `e2e_<run-id>` marker.
- Produces: marker-scoped cleanup for journal rows, dependent comments/notifications, and Storage objects.

- [ ] Write or extract a testable cleanup predicate proving a non-E2E row cannot match.
- [ ] Run the focused test and verify RED against the old broad `e2e-task9-` cleanup.
- [ ] Generate one unique run marker and use it for content and Storage paths.
- [ ] Require both dedicated user IDs and the `e2e_` prefix in pre/post cleanup queries.
- [ ] Preserve cleanup failure as a failed run and report only the marker.
- [ ] Run focused unit tests and typecheck.

### Task 8: Complete isolated verification and documentation

**Files:**
- Create: `docs/phase2/batch2-engineering-hardening.md`
- Create only if a product bug is found: `docs/phase2/batch3-backlog.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: evidence-based Batch 2 gate report.

- [ ] Run `npm test` and record files/tests/pass/fail.
- [ ] Run `npx tsc --noEmit` and require exit code 0.
- [ ] Run `npm run lint` and require zero errors.
- [ ] Run `npm run build` and require success.
- [ ] Run full `npm run test:e2e`; record project ref, test count, writes, Storage coverage, cleanup result, and residual markers.
- [ ] Confirm no production schema/data/migration/RLS/RPC changes and no product-code behavior changes.
- [ ] Write the hardening report with actual evidence and STOP for Gate Review.
