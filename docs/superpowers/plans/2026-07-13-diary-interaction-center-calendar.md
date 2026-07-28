# Inline Interaction, Personal Center, and Continuous Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the detached annotation module with inline selection actions, add excerpt/letter bookmarks and a personal content center, and upgrade the homepage to month/quarter/year continuous heart views with inline event creation.

**Architecture:** Reader rendering assigns stable block IDs from the rich-text document and maps browser selections to block-relative anchors. Personal-center queries are cursor-paginated by content type. One shared calendar range model drives month, quarter, and year visualizations; private draft/scheduled states are merged only for the current viewer.

**Tech Stack:** React 19, TipTap/ProseMirror JSON rendering, Supabase, Next.js App Router, Vitest, Testing Library, Playwright

## Global Constraints

- Do not render a standalone bottom annotation section.
- Desktop selection and context menu plus mobile text selection expose both “评论” and “收藏”.
- Quarter/year hearts are continuous across month boundaries; dates are visually secondary.
- Event creation stays in a modal and never navigates away.

---

### Task 1: Model stable selection anchors

**Files:**
- Create: `src/features/annotations/selection-anchor.ts`
- Create: `src/features/annotations/selection-anchor.test.ts`
- Modify: `src/features/annotations/actions.ts`
- Modify: `supabase/migrations/202607130002_letter_assets_bookmarks.sql`

**Interfaces:**
- Produces: `SelectionAnchor { blockId, startOffset, endOffset, quotedText }`, `anchorFromSelection(range, root)`, and `resolveAnchor(anchor, root)`.

- [ ] **Step 1: Write DOM range tests**

```ts
it("creates offsets relative to one stable block", () => {
  root.innerHTML = '<p data-block-id="p-1">今天准备出发去广州</p>';
  const range = document.createRange();
  range.setStart(root.querySelector("p")!.firstChild!, 2);
  range.setEnd(root.querySelector("p")!.firstChild!, 6);
  expect(anchorFromSelection(range, root)).toEqual({ blockId: "p-1", startOffset: 2, endOffset: 6, quotedText: "准备出发" });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/annotations/selection-anchor.test.ts`  
Expected: FAIL because anchor helpers are absent.

- [ ] **Step 3: Implement single-block selection and graceful rejection**

Return `{ ok: false, message: "请在同一段文字中选择内容" }` for cross-block selections in phase one. Resolve by block ID and verify `quotedText`; if it differs, return the saved quote as a detached snapshot.

- [ ] **Step 4: Persist block IDs in annotation actions**

Update validation to require `blockId`, `startOffset`, `endOffset`, and `quotedText`; remove the current hard-coded `startOffset: 0` path.

- [ ] **Step 5: Test and commit**

Run: `npm test -- src/features/annotations/selection-anchor.test.ts && npm run lint`  
Expected: PASS and exit 0.

```powershell
git add src/features/annotations supabase/migrations/202607130002_letter_assets_bookmarks.sql
git commit -m "feat: anchor comments to rich text blocks"
```

### Task 2: Replace AnnotationLayer with inline actions and bookmarks

**Files:**
- Create: `src/features/annotations/components/InlineSelectionMenu.tsx`
- Create: `src/features/annotations/components/InlineCommentPopover.tsx`
- Create: `src/features/bookmarks/actions.ts`
- Create: `src/features/bookmarks/actions.test.ts`
- Modify: `src/features/letters/components/LetterReader.tsx`
- Delete: `src/features/annotations/components/AnnotationLayer.tsx`

**Interfaces:**
- Produces: `InlineSelectionMenu({ letterId, rootRef })`, `createBookmarkAction`, `removeBookmarkAction`, and `toggleWholeLetterBookmarkAction`.

- [ ] **Step 1: Write bookmark idempotency tests**

```ts
it("does not duplicate the same excerpt bookmark", async () => {
  await createBookmark(repo, userId, excerpt);
  await createBookmark(repo, userId, excerpt);
  expect(repo.count()).toBe(1);
});
```

- [ ] **Step 2: Implement selection positioning**

Use `range.getBoundingClientRect()` and clamp the menu inside the visual viewport. Open from `selectionchange`/pointer release and `contextmenu`; do not prevent the browser's native mobile selection handles.

- [ ] **Step 3: Implement comment and bookmark actions**

Comment opens a focusable popover beside the selection. Bookmark saves immediately, shows “已收藏”, and closes the menu. Add a whole-letter heart action to the reader header.

- [ ] **Step 4: Render saved highlights inside blocks**

Split block text at sorted annotation boundaries and wrap matching spans with `data-annotation-id`; clicking a highlight opens its thread. Withdrawn letters render quote snapshots only, never the hidden body.

- [ ] **Step 5: Remove the old module and verify**

Run: `rg "AnnotationLayer|评点选中文字" src`  
Expected: no matches.  
Run: `npm test -- src/features/bookmarks/actions.test.ts && npm run build`  
Expected: PASS and exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/features/annotations src/features/bookmarks src/features/letters/components/LetterReader.tsx
git commit -m "feat: add inline comments and bookmarks"
```

### Task 3: Add the personal center with cursor pagination

**Files:**
- Create: `src/app/(app)/me/layout.tsx`
- Create: `src/app/(app)/me/page.tsx`
- Create: `src/app/(app)/me/letters/page.tsx`
- Create: `src/app/(app)/me/drafts/page.tsx`
- Create: `src/app/(app)/me/future/page.tsx`
- Create: `src/app/(app)/me/comments/page.tsx`
- Create: `src/app/(app)/me/bookmarks/page.tsx`
- Create: `src/app/(app)/me/events/page.tsx`
- Create: `src/features/personal-center/queries.ts`
- Create: `src/features/personal-center/queries.test.ts`
- Create: `src/features/personal-center/components/PersonalCenterNav.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: `PersonalContentPage<T> { items, nextCursor }` and six query functions with `limit <= 20`.

- [ ] **Step 1: Test stable cursor ordering**

```ts
it("orders published content by publishedAt then id", () => {
  expect(sortAndPage(rows, { limit: 2, cursor: null }).items.map((x) => x.id)).toEqual(["c", "b"]);
});
```

- [ ] **Step 2: Implement viewer-scoped queries**

Every query starts with `requireUser()` and filters by `author_id`, `owner_id`, or `creator_id`. Use `(timestamp,id)` cursors; never fetch all history. Draft and future queries must never include the partner's rows.

- [ ] **Step 3: Build desktop and mobile navigation**

Desktop `md+`: persistent left navigation.  
Mobile: profile summary plus six entry cards; subpages use a back link and no fixed side rail.

- [ ] **Step 4: Add future-letter controls**

Future rows expose Edit, Change time, Return to drafts, and Delete. Published rows are read-only and expose Withdraw only when the server returns `canWithdraw: true`.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- src/features/personal-center/queries.test.ts && npm run build`  
Expected: PASS and exit 0.

```powershell
git add src/app/(app)/me src/features/personal-center src/app/(app)/layout.tsx
git commit -m "feat: add personal content center"
```

### Task 4: Build the shared heart-range calendar model

**Files:**
- Create: `src/features/calendar/heart-range.ts`
- Create: `src/features/calendar/heart-range.test.ts`
- Refactor: `src/features/calendar/actions.ts`
- Modify: `src/features/home/components/MonthHeatmap.tsx`

**Interfaces:**
- Produces: `CalendarView = month | quarter | year`, `HeartState = empty | a | b | both | private`, `getCalendarRange(view, anchor)`, and `buildHeartDays(rows, viewerId)`.

- [ ] **Step 1: Write range and color tests**

```ts
it("keeps quarter days continuous over month boundaries", () => {
  const range = getCalendarRange("quarter", new Date("2026-08-15T00:00:00+08:00"));
  expect(range).toEqual({ start: "2026-07-01", end: "2026-09-30" });
});

it("shows private yellow only to the owner", () => {
  expect(buildHeartDays(rowsWithADraft, "a")[0].state).toBe("private");
  expect(buildHeartDays(rowsWithADraft, "b")[0].state).toBe("empty");
});
```

- [ ] **Step 2: Implement one bounded range query**

Fetch published/withdrawn daily letters for both users and draft/scheduled rows for only the viewer within the range. Time-capsule publications become envelope counts and never change the daily heart color.

- [ ] **Step 3: Preserve month order continuously**

Return one chronological `days` array. Do not group into month cards. Include `monthLabel` only on the first day of a month for lightweight axis rendering.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/calendar/heart-range.test.ts`  
Expected: PASS.

```powershell
git add src/features/calendar src/features/home/components/MonthHeatmap.tsx
git commit -m "feat: model continuous heart calendar ranges"
```

### Task 5: Render month, quarter, and year views with inline event creation

**Files:**
- Create: `src/features/home/components/HeartCalendar.tsx`
- Create: `src/features/home/components/HeartCalendar.test.tsx`
- Create: `src/features/home/components/HeartDay.tsx`
- Modify: `src/features/calendar/components/EventDialog.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/calendar/page.tsx`

**Interfaces:**
- Consumes: `HeartDay[]` from Task 4.
- Produces: accessible view switcher and hover/tap event actions.

- [ ] **Step 1: Test view switching and mobile fallback**

```tsx
render(<HeartCalendar initialView="month" data={fixture} />);
await user.click(screen.getByRole("button", { name: "季度" }));
expect(screen.getByTestId("heart-strip")).toHaveAttribute("data-view", "quarter");
await user.click(screen.getByLabelText("2026年7月13日"));
expect(screen.getByRole("button", { name: "添加事件" })).toBeVisible();
```

- [ ] **Step 2: Implement the approved visual hierarchy**

Month: date label above a separate heart.  
Quarter: full hearts in a continuous seven-row time strip with month labels below.  
Year: smaller heart marks in a continuous 53-column strip; date appears only on focus/hover/tap.

- [ ] **Step 3: Add event creation without navigation**

Desktop hover/focus exposes “＋添加事件”. Mobile tap opens an action sheet with “查看当日内容” and “添加事件”. Pass the selected date into `EventDialog`; successful creation updates the local day immediately and revalidates in the background.

- [ ] **Step 4: Keep events independent of letter state**

Render event icons separately from heart color and envelope count. Remove any event-create import from writing components.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- src/features/home/components/HeartCalendar.test.tsx && npm run build`  
Expected: PASS and exit 0.

```powershell
git add src/features/home/components src/features/calendar/components/EventDialog.tsx src/app/(app)/page.tsx src/app/(app)/calendar/page.tsx
git commit -m "feat: add continuous heart calendar"
```

### Task 6: Complete notification deep links and withdrawn rendering

**Files:**
- Modify: `src/features/notifications/actions.ts`
- Modify: `src/features/notifications/components/NotificationBell.tsx`
- Modify: `src/app/(app)/letters/[date]/page.tsx`
- Modify: `src/features/letters/components/LetterReader.tsx`
- Test: `src/features/notifications/actions.test.ts`

**Interfaces:**
- Produces links like `/letters/2026-07-13?letter=<id>#annotation-<id>` and withdrawn-safe reader states.

- [ ] **Step 1: Test source-aware deep links**

```ts
expect(buildNotificationHref({ type: "annotation", letterDate: "2026-07-13", letterId: "l1", annotationId: "a1" }))
  .toBe("/letters/2026-07-13?letter=l1#annotation-a1");
```

- [ ] **Step 2: Store or resolve both letter and annotation IDs**

Do not assume `notifications.source_id` is always a letter ID. Resolve annotation replies through annotation → letter and generate the canonical link.

- [ ] **Step 3: Render withdrawn letters safely**

Reader state must contain no `bodyJson`, `bodyText`, image signed URLs, or slider values when status is `withdrawn`. Display only withdrawal copy plus permitted response/comment/bookmark snapshots.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/features/notifications/actions.test.ts && npm run build`  
Expected: PASS and exit 0.

```powershell
git add src/features/notifications src/app/(app)/letters src/features/letters/components/LetterReader.tsx
git commit -m "fix: preserve interaction links after withdrawal"
```

### Task 7: Full verification, documentation, push, and production deployment

**Files:**
- Modify: `README.md`
- Modify: `tests/e2e/couple-diary.spec.ts`
- Create: `docs/testing/2026-07-13-diary-phase-one-verification.md`

**Interfaces:**
- Produces: release evidence and a deployable `main` branch.

- [ ] **Step 1: Add complete two-user E2E stories**

Cover: daily draft autosave; schedule/return/delete time capsule; publish lock; 3-character opening response; inline comment/reply; excerpt bookmark; 24-hour withdrawal; private-yellow visibility; month/quarter/year switching; inline event creation; personal-center navigation.

- [ ] **Step 2: Run all local gates**

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

Expected: unit tests, lint, and build exit 0; authenticated E2E passes with the configured local accounts.

- [ ] **Step 3: Verify migrations on the linked Supabase project**

Apply migrations in filename order, then verify:

```sql
select kind, status, count(*) from public.letters group by kind, status order by 1,2;
select jobname, schedule, active from cron.job where jobname = 'publish-due-letters';
select id, public from storage.buckets where id = 'letter-images';
```

Expected: migrated letters have valid states, cron is active with `* * * * *`, and `letter-images.public = false`.

- [ ] **Step 4: Update README without secrets**

Document migration order, the private image bucket, cron publishing, local test commands, and production rollback steps. Do not copy `.env.local` values.

- [ ] **Step 5: Record verification evidence**

In `docs/testing/2026-07-13-diary-phase-one-verification.md`, record command, date, exit status, tested URL, test-account labels A/B without emails, and observed performance medians.

- [ ] **Step 6: Commit and push**

```powershell
git add README.md tests/e2e/couple-diary.spec.ts docs/testing/2026-07-13-diary-phase-one-verification.md
git commit -m "test: verify diary phase one flows"
git push origin main
```

Expected: push succeeds and `origin/main` points at the verification commit.

- [ ] **Step 7: Verify Vercel production**

Wait for the GitHub-triggered production deployment, then test `https://nkd-diary.vercel.app/login` with both seeded accounts: login, home, write draft, minimize/restore, publish, open response, inline comment, personal center, calendar view switch, and event modal. Check browser console plus Vercel runtime logs for new errors.

- [ ] **Step 8: Roll back on release-blocking failure**

If production has data-loss, auth, publication, or RLS failures, immediately promote the previous known-good Vercel deployment. Do not reverse irreversible database migrations; use a forward repair migration after rollback.

