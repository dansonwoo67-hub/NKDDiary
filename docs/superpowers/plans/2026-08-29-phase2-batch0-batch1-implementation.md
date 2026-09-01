# NKDDiary Phase 2 Batch 0 + Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish evidence-backed performance baselines and stable Memory, Letter Thread, Relationship Date, and Notification Target contracts without changing current product behavior or production data.

**Architecture:** Add four pure TypeScript domain modules with focused adapters and unit tests. Keep legacy schema compatibility at adapter boundaries, document rather than implement future database changes, and leave UI/query optimization for later batches.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase contracts, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-phase2-batch0-batch1-domain-design.md`

## Global Constraints

- Do not access or modify Production data or schema.
- Do not create or execute migrations; schema output is proposal only.
- Do not infer historical letter threads.
- Do not include calendar events in the Memory product domain.
- Preserve notification badge semantics and existing UI behavior.
- Use `Asia/Taipei` for new relationship-date APIs without mass-rewriting old call sites.
- Do not begin Batch 2.

---

### Task 1: Relationship Date Domain

**Files:**
- Create: `src/lib/date/relationship-date.ts`
- Create: `src/lib/date/relationship-date.test.ts`

**Interfaces:**
- Produces: `RELATIONSHIP_TIME_ZONE`, `toRelationshipDate`, `getTodayInRelationshipTimezone`, `formatRelationshipDate`, `formatRelationshipDateTime`, `compareRelationshipDates`.

- [ ] Write tests for UTC+8 00:01, 23:59, month boundary, year boundary, formatting, and comparison.
- [ ] Run the focused test and verify failure because the module does not exist.
- [ ] Implement the smallest Intl-based fixed-timezone API.
- [ ] Run the focused test and full date tests.

### Task 2: Unified Memory Contract and Adapters

**Files:**
- Create: `src/features/memories/domain.ts`
- Create: `src/features/memories/domain.test.ts`

**Interfaces:**
- Produces: `UnifiedMemory`, `MemorySourceType`, `mapLegacyMoodToMemory`, `mapLegacyMemoryToMemory`.

- [ ] Write tests for legacy mood, titled legacy memory, missing image, and a title-less memory-compatible row.
- [ ] Run the focused test and verify missing-module failure.
- [ ] Implement pure row-to-domain mappers without changing repositories or UI.
- [ ] Run focused and existing memory tests.

### Task 3: Letter and Thread Contracts

**Files:**
- Create: `src/features/journal/letter-thread-domain.ts`
- Create: `src/features/journal/letter-thread-domain.test.ts`

**Interfaces:**
- Produces: `LetterDomain`, `LetterThread`, `classifyLetter`, `mapLetterRow`, `buildLetterThreads`.

- [ ] Write tests for one letter, explicit multi-reply thread, capsule origin, withdrawn state, unopened/opened semantics, and legacy exclusion.
- [ ] Run the focused test and verify missing-module failure.
- [ ] Implement explicit-ID grouping only; standalone records use their own IDs as thread IDs.
- [ ] Run focused and existing journal tests.

### Task 4: Notification Target Contract

**Files:**
- Create: `src/features/notifications/target.ts`
- Create: `src/features/notifications/target.test.ts`

**Interfaces:**
- Produces: `NotificationTarget`, `NotificationDomain`, `buildNotificationHref`, `isNotificationNavigable`.

- [ ] Write tests for unread, read-but-navigable, inactive, memory comment anchor, letter thread, calendar date, and relationship setting.
- [ ] Run the focused test and verify missing-module failure.
- [ ] Implement pure target-to-URL mapping with read state independent from navigation.
- [ ] Run focused and existing notification tests.

### Task 5: Audit and Proposal Documents

**Files:**
- Create: `docs/phase2/batch0-performance-baseline.md`
- Create: `docs/phase2/domain-model.md`
- Create: `docs/phase2/memory-contract.md`
- Create: `docs/phase2/letter-thread-contract.md`
- Create: `docs/phase2/relationship-date-contract.md`
- Create: `docs/phase2/notification-target-contract.md`
- Create: `docs/phase2/schema-change-proposal.md`

**Interfaces:**
- Consumes: repository audit evidence and Tasks 1-4 contracts.
- Produces: Batch 0/1 review artifacts only.

- [ ] Document concrete query/re-render evidence with file and line references, P0/P1/P2, and future batch ownership.
- [ ] Document the four approved domain decisions and compatibility boundaries.
- [ ] Document additive nullable `thread_id`/`reply_to_id`, indexes, backfill policy, RLS impact, rollback, and risk without SQL migration.

### Task 6: Full Verification and Stop

**Files:**
- Modify only if a new domain test exposes a defect inside the newly added domain modules.

- [ ] Run `npm test` and record file/test counts.
- [ ] Run `npm run lint` and record errors/warnings.
- [ ] Run `npx tsc --noEmit` and record result.
- [ ] Run `npm run build` and record result.
- [ ] Run `npm run test:e2e` and record result.
- [ ] Confirm Git diff contains no migration, UI, production configuration, or unrelated `next-env.d.ts` edits.
- [ ] STOP before Batch 2.
