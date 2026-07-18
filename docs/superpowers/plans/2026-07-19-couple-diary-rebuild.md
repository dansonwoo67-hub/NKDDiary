# Couple Diary Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the private two-person diary so the final product contains independent “today diary” and recipient-opened “future diary” flows alongside the approved mood, calendar, memories, settings, comments, and annotations.

**Architecture:** Next.js App Router renders one authenticated private space backed by Supabase Auth, Postgres RLS, and private Storage. A unified `journal_entries` model shares reading and interaction behavior while partial unique indexes and database functions enforce separate daily quotas and the future-diary seal/open lifecycle. Each phase leaves a working, testable increment and stops for user approval before the next phase.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Supabase Auth/PostgreSQL/Storage SSR, Zod 4, date-fns 4, Lucide React, Vitest 4, Testing Library, Playwright 1.61, Vercel

## Global Constraints

- The site has exactly one private couple space and two pre-approved accounts; there is no public registration or third-user flow.
- All business rows contain `space_id`; authorization is enforced by Postgres RLS and server-side checks, never by hidden UI alone.
- All product-day calculations use `Asia/Shanghai`; timestamps are stored as `timestamptz` in UTC.
- Each user may publish at most one today diary per local date.
- Each user may create at most one future diary per local creation date.
- Today-diary and future-diary quotas are independent; a future diary never consumes the quota of its creation or opening date.
- A today diary is editable and deletable for 24 hours after publication, then permanently locked.
- A future diary is immutable and non-withdrawable immediately after sealing; its author may always reread it.
- Before recipient opening, the recipient sees only sender, sealed time, scheduled opening time, and countdown—never title, body, image path, or signed URL.
- Reaching `open_at` only enables the open action; only the designated recipient can actively open the diary.
- A future diary contains title, text, and at most one optional private image.
- Opened future diaries support the same single-level comments, inline annotations, and annotation replies as ordinary diaries.
- Images are compressed in the browser, stored in a private bucket, and served only by short-lived signed URLs after permission checks.
- Do not add tags, likes, follows, public sharing, analytics, payments, AI relationship scoring, video, audio, multi-image galleries, or permanent public URLs.
- Do not commit `.env.local`, credentials, passwords, Supabase service-role keys, `desktop.ini`, or `docs/audits/`.
- At the end of every task, report changed files, verification output, remaining risks, and stop until the user says “继续下一个阶段”.

## File Structure

- `src/features/journal/domain.ts`: diary types, state derivation, quota dates, and pure validation.
- `src/features/journal/repository.ts`: typed Supabase reads with safe public/full projections.
- `src/features/journal/actions.ts`: server actions for today publication, future sealing, opening, editing, and deletion.
- `src/features/journal/components/`: focused editors, cards, countdown, reader, comments, and annotation UI.
- `src/features/media/compress-image.ts`: browser-only one-image validation and compression.
- `src/features/interactions/`: comment and annotation actions shared by both diary types.
- `src/features/mood/`, `src/features/calendar/`, `src/features/memories/`: independent non-diary product areas.
- `src/app/(app)/journal/`: journal routes; route pages fetch data and delegate presentation to feature components.
- `supabase/migrations/202607190001_rebuild_core.sql`: spaces, profiles, membership, journal enum/table, indexes, triggers, and RLS.
- `supabase/migrations/202607190002_journal_functions.sql`: security-definer lifecycle functions and grants.
- `supabase/migrations/202607190003_interactions_and_storage.sql`: comments, annotations, replies, notifications, and private image policies.
- `tests/e2e/`: the two-user browser journeys.

---

### Task 1: Establish the clean application shell and two-user boundary

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/proxy.ts`
- Modify: `src/features/auth/actions.ts`
- Modify: `src/lib/auth/require-user.ts`
- Create: `src/lib/auth/require-user.test.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `requireUser(): Promise<{ userId: string; profile: Profile; spaceId: string }>` and authenticated routing that redirects guests to `/login`.
- Consumes: Supabase SSR clients from `src/lib/supabase/{client,server,proxy}.ts`.

- [ ] **Step 1: Write the failing membership test**

```ts
import { describe, expect, it } from "vitest";
import { resolveMembership } from "./require-user";

describe("resolveMembership", () => {
  it("rejects authenticated users without an active couple membership", () => {
    expect(() => resolveMembership("user-3", [])).toThrow("无权访问这个私人空间");
  });

  it("returns the only active membership", () => {
    expect(resolveMembership("user-1", [{ user_id: "user-1", space_id: "space-1", active: true }])).toEqual({
      userId: "user-1",
      spaceId: "space-1",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/lib/auth/require-user.test.ts`  
Expected: FAIL because `resolveMembership` is not exported.

- [ ] **Step 3: Implement the membership boundary and authenticated shell**

```ts
export type MembershipRow = { user_id: string; space_id: string; active: boolean };

export function resolveMembership(userId: string, rows: MembershipRow[]) {
  const membership = rows.find((row) => row.user_id === userId && row.active);
  if (!membership) throw new Error("无权访问这个私人空间");
  return { userId, spaceId: membership.space_id };
}
```

Update `requireUser` to load the authenticated user, profile, and one active membership. Keep `/login` public and redirect every other unauthenticated route to `/login`. The app navigation contains 首页、日记、回忆、日历、心情、设置 and 退出; it contains no public signup link.

- [ ] **Step 4: Verify the shell**

Run: `npm test -- src/lib/auth/require-user.test.ts && npm run lint && npm run build`  
Expected: test PASS; lint and build exit 0.

- [ ] **Step 5: Commit and stop**

```powershell
git add .env.local.example src/app src/features/auth src/lib/auth src/proxy.ts
git commit -m "feat: establish private couple app shell"
```

### Task 2: Create the authoritative journal schema and separate quotas

**Files:**
- Create: `supabase/migrations/202607190001_rebuild_core.sql`
- Modify: `supabase/seed.sql`
- Modify: `scripts/seed-couple-users.ts`
- Create: `src/features/journal/domain.ts`
- Create: `src/features/journal/domain.test.ts`

**Interfaces:**
- Produces: `journal_entry_type`, `spaces`, `space_members`, `profiles`, `journal_entries`, `getChinaDate(date)`, `deriveFutureState(entry, now)`.
- Consumes: the two pre-created Supabase Auth user IDs supplied to the seed script.

- [ ] **Step 1: Write failing domain tests**

```ts
import { describe, expect, it } from "vitest";
import { deriveFutureState, getChinaDate } from "./domain";

describe("future diary domain", () => {
  it("uses the Shanghai calendar date", () => {
    expect(getChinaDate(new Date("2026-07-19T16:30:00Z"))).toBe("2026-07-20");
  });

  it("requires an explicit open after the scheduled time", () => {
    const entry = { openAt: "2026-08-01T12:00:00Z", openedAt: null };
    expect(deriveFutureState(entry, new Date("2026-08-01T11:59:59Z"))).toBe("waiting");
    expect(deriveFutureState(entry, new Date("2026-08-01T12:00:00Z"))).toBe("ready");
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/journal/domain.test.ts`  
Expected: FAIL because the journal domain does not exist.

- [ ] **Step 3: Implement pure domain types and functions**

```ts
export type JournalEntryType = "today" | "future";
export type FutureDiaryState = "waiting" | "ready" | "opened";
export type FutureStateInput = { openAt: string; openedAt: string | null };

export function getChinaDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function deriveFutureState(entry: FutureStateInput, now = new Date()): FutureDiaryState {
  if (entry.openedAt) return "opened";
  return now.getTime() >= new Date(entry.openAt).getTime() ? "ready" : "waiting";
}
```

- [ ] **Step 4: Write the schema migration with partial quota indexes**

```sql
create type public.journal_entry_type as enum ('today', 'future');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  timezone text not null default 'Asia/Shanghai' check (timezone = 'Asia/Shanghai'),
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  active boolean not null default true,
  primary key (space_id, user_id)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  recipient_id uuid references auth.users(id) on delete restrict,
  entry_type public.journal_entry_type not null,
  title text not null check (char_length(title) between 1 and 80),
  content text not null check (char_length(content) between 1 and 20000),
  image_path text,
  entry_date date,
  created_local_date date not null,
  published_at timestamptz not null default now(),
  locked_at timestamptz,
  sealed_at timestamptz,
  open_at timestamptz,
  opened_at timestamptz,
  opened_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (entry_type = 'today' and recipient_id is null and entry_date is not null and open_at is null and sealed_at is null)
    or
    (entry_type = 'future' and recipient_id is not null and entry_date is null and open_at is not null and sealed_at is not null)
  )
);

create unique index one_today_diary_per_author_date
  on public.journal_entries(space_id, author_id, entry_date)
  where entry_type = 'today';

create unique index one_future_diary_per_author_creation_date
  on public.journal_entries(space_id, author_id, created_local_date)
  where entry_type = 'future';
```

Add a trigger that rejects a third active member and preserves immutable identity/lifecycle columns. Enable RLS on every table. Seed exactly one space and the two supplied Auth users.

- [ ] **Step 5: Apply and verify schema**

Run locally: `npx supabase db reset`  
Expected: all migrations and seed complete without SQL errors.  
Run: `npm test -- src/features/journal/domain.test.ts && npm run build`  
Expected: PASS and exit 0.

- [ ] **Step 6: Commit and stop**

```powershell
git add supabase/migrations/202607190001_rebuild_core.sql supabase/seed.sql scripts/seed-couple-users.ts src/features/journal
git commit -m "feat: model today and future diaries"
```

### Task 3: Enforce journal lifecycle through database functions and safe projections

**Files:**
- Create: `supabase/migrations/202607190002_journal_functions.sql`
- Create: `src/features/journal/repository.ts`
- Create: `src/features/journal/repository.test.ts`
- Create: `src/features/journal/actions.ts`
- Create: `src/features/journal/actions.test.ts`

**Interfaces:**
- Produces: `create_today_diary`, `seal_future_diary`, `open_future_diary`, `update_today_diary`, `delete_today_diary`; `listFutureDiaryCards`, `getJournalEntry`, and matching server actions.
- Consumes: Task 2 tables and `requireUser()` from Task 1.

- [ ] **Step 1: Write failing visibility tests**

```ts
it("does not select protected fields for an unopened recipient card", async () => {
  const cards = await listFutureDiaryCards(fakeClient, { userId: "recipient", box: "received" });
  expect(cards[0]).toEqual(expect.objectContaining({ authorId: "author", state: "waiting" }));
  expect(cards[0]).not.toHaveProperty("title");
  expect(cards[0]).not.toHaveProperty("content");
  expect(cards[0]).not.toHaveProperty("imagePath");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/journal/repository.test.ts src/features/journal/actions.test.ts`  
Expected: FAIL because repository and actions are absent.

- [ ] **Step 3: Implement security-definer lifecycle functions**

`seal_future_diary` derives `created_local_date` inside Postgres, verifies the recipient is the other active member, requires `p_open_at > now()`, and inserts an immutable future row. `open_future_diary` locks the row, verifies `auth.uid() = recipient_id` and `now() >= open_at`, then performs the idempotent update:

```sql
update public.journal_entries
set opened_at = coalesce(opened_at, now()),
    opened_by = coalesce(opened_by, auth.uid())
where id = p_entry_id
returning id, opened_at, opened_by;
```

Revoke direct insert/update/delete access to `journal_entries`; grant only the narrow functions. Today edit/delete functions require author ownership and `now() <= locked_at`. RLS permits full future content to the author and to the recipient only when `opened_at is not null`.

- [ ] **Step 4: Implement split public/full repository projections**

```ts
const FUTURE_CARD_FIELDS = "id, author_id, recipient_id, sealed_at, open_at, opened_at, created_at";
const FULL_ENTRY_FIELDS = "id, space_id, author_id, recipient_id, entry_type, title, content, image_path, entry_date, published_at, locked_at, sealed_at, open_at, opened_at";
```

Never add protected fields to `FUTURE_CARD_FIELDS`. `getJournalEntry` requests `FULL_ENTRY_FIELDS` and treats an RLS-empty result as not found without revealing whether a protected row exists.

- [ ] **Step 5: Implement typed Zod server actions**

```ts
const futureDiarySchema = z.object({
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(20_000),
  recipientId: z.string().uuid(),
  openAt: z.string().datetime({ offset: true }),
  imagePath: z.string().min(1).nullable(),
});
```

Actions call only database functions, map unique-index violations to “今天已经写过一篇未来日记了”, and revalidate `/`, `/journal`, `/journal/future`, and `/journal/[id]` as applicable.

- [ ] **Step 6: Verify lifecycle and build**

Run: `npm test -- src/features/journal/repository.test.ts src/features/journal/actions.test.ts && npm run lint && npm run build`  
Expected: tests PASS; lint and build exit 0.

- [ ] **Step 7: Commit and stop**

```powershell
git add supabase/migrations/202607190002_journal_functions.sql src/features/journal
git commit -m "feat: enforce secure journal lifecycle"
```

### Task 4: Build today-diary creation, reading, and 24-hour locking

**Files:**
- Create: `src/app/(app)/journal/page.tsx`
- Create: `src/app/(app)/journal/new/page.tsx`
- Create: `src/app/(app)/journal/[id]/page.tsx`
- Create: `src/app/(app)/journal/[id]/edit/page.tsx`
- Create: `src/features/journal/components/TodayDiaryEditor.tsx`
- Create: `src/features/journal/components/JournalReader.tsx`
- Create: `src/features/journal/components/JournalCard.tsx`
- Create: `src/features/journal/components/TodayDiaryEditor.test.tsx`

**Interfaces:**
- Produces: accessible today editor and shared reader/card components.
- Consumes: Task 3 actions and repository functions.

- [ ] **Step 1: Write the failing editor test**

```tsx
render(<TodayDiaryEditor today="2026-07-19" action={action} />);
await user.type(screen.getByLabelText("标题"), "普通的一天");
await user.type(screen.getByLabelText("正文"), "今天一起散步。 ");
await user.click(screen.getByRole("button", { name: "发布今天日记" }));
expect(action).toHaveBeenCalledWith(expect.objectContaining({ entryDate: "2026-07-19" }));
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/journal/components/TodayDiaryEditor.test.tsx`  
Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement routes and focused components**

The journal center shows separate “今天日记” and “未来日记” entry cards. The editor displays title, plain-text body, optional image control supplied by Task 5, character counts, validation messages, and one submit action. The reader shows author, entry date, publication/update time, lock state, title, body, and optional image.

- [ ] **Step 4: Verify today lifecycle**

Run: `npm test -- src/features/journal/components/TodayDiaryEditor.test.tsx && npm run lint && npm run build`  
Expected: PASS and exit 0.

- [ ] **Step 5: Commit and stop**

```powershell
git add src/app/(app)/journal src/features/journal/components
git commit -m "feat: add today diary experience"
```

### Task 5: Add one-image compression and private Storage access

**Files:**
- Create: `src/features/media/compress-image.ts`
- Create: `src/features/media/compress-image.test.ts`
- Create: `src/features/media/ImagePicker.tsx`
- Create: `src/features/media/actions.ts`
- Create: `supabase/migrations/202607190003_interactions_and_storage.sql`
- Modify: `src/features/journal/components/TodayDiaryEditor.tsx`

**Interfaces:**
- Produces: `compressJournalImage(file): Promise<Blob>`, `uploadJournalImageAction`, and `getReadableImageUrl(entryId)`.
- Consumes: journal permission checks from Task 3.

- [ ] **Step 1: Write failing file-policy tests**

```ts
expect(() => validateSourceImage({ type: "image/gif", size: 1000 })).toThrow("仅支持 JPG、PNG 或 WebP");
expect(() => validateSourceImage({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 })).toThrow("图片不能超过 10MB");
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/media/compress-image.test.ts`  
Expected: FAIL because media helpers are absent.

- [ ] **Step 3: Implement browser compression**

Accept JPEG, PNG, and WebP up to 10 MB; decode with `createImageBitmap`, scale the longest edge to at most 1600 px, draw to Canvas, and export WebP around quality `0.75`. Reject the result above 800 KB and aim for 500 KB or less. Canvas re-encoding removes EXIF metadata.

- [ ] **Step 4: Create private bucket policies and signed-URL action**

Create non-public bucket `journal-images` with an 800 KB server limit. Store objects as `<space_id>/<author_id>/<entry_id>.webp`. Storage RLS verifies active membership and ownership for upload. `getReadableImageUrl` first calls the journal repository; it signs a 300-second URL only after full-content access succeeds.

- [ ] **Step 5: Verify media behavior**

Run: `npm test -- src/features/media/compress-image.test.ts && npm run build`  
Expected: PASS and exit 0.

- [ ] **Step 6: Commit and stop**

```powershell
git add src/features/media src/features/journal/components/TodayDiaryEditor.tsx supabase/migrations/202607190003_interactions_and_storage.sql
git commit -m "feat: secure single diary images"
```

### Task 6: Build future-diary creation, sealing, countdown, and active opening

**Files:**
- Create: `src/app/(app)/journal/future/page.tsx`
- Create: `src/app/(app)/journal/future/new/page.tsx`
- Create: `src/features/journal/components/FutureDiaryEditor.tsx`
- Create: `src/features/journal/components/FutureDiaryCard.tsx`
- Create: `src/features/journal/components/FutureDiaryCountdown.tsx`
- Create: `src/features/journal/components/OpenFutureDiaryButton.tsx`
- Create: `src/features/journal/components/FutureDiaryEditor.test.tsx`
- Create: `src/features/journal/components/FutureDiaryCard.test.tsx`

**Interfaces:**
- Produces: future editor; received/sent filters; waiting, ready, and opened cards; explicit open confirmation.
- Consumes: Task 3 lifecycle actions and Task 5 image picker.

- [ ] **Step 1: Write failing sealed-card tests**

```tsx
render(<FutureDiaryCard role="recipient" entry={{ id: "1", authorName: "小丹", state: "waiting", openAt: "2026-08-01T12:00:00Z" }} />);
expect(screen.getByText("小丹留给你一颗时间胶囊")).toBeVisible();
expect(screen.queryByText(/标题|正文/)).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "开启胶囊" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/journal/components/FutureDiaryEditor.test.tsx src/features/journal/components/FutureDiaryCard.test.tsx`  
Expected: FAIL because components are absent.

- [ ] **Step 3: Implement the future editor and irreversible confirmation**

The form includes title, body, one optional image, and `datetime-local`. Convert the selected Shanghai wall time to an ISO timestamp with offset. Before submission show: “封存后不能修改、撤回或删除。你仍可在‘我写出的’中回看。” Require an explicit “确认封存” action.

- [ ] **Step 4: Implement received/sent lists and countdown**

Received cards render only safe metadata until `opened_at` exists. Sent cards may render title and excerpt because the author has full access. The countdown updates once per second while visible, but its reaching zero only enables the open button; it never reveals content locally.

- [ ] **Step 5: Implement active opening**

`OpenFutureDiaryButton` asks for confirmation, invokes `openFutureDiaryAction(entryId)`, then refreshes the route. Display server errors without inferring whether the protected content exists. The server result—not the browser clock—determines success.

- [ ] **Step 6: Verify future flow**

Run: `npm test -- src/features/journal/components/FutureDiaryEditor.test.tsx src/features/journal/components/FutureDiaryCard.test.tsx && npm run lint && npm run build`  
Expected: PASS and exit 0.

- [ ] **Step 7: Commit and stop**

```powershell
git add src/app/(app)/journal/future src/features/journal/components
git commit -m "feat: add sealed future diary flow"
```

### Task 7: Share comments, inline annotations, replies, and opening notifications

**Files:**
- Modify: `supabase/migrations/202607190003_interactions_and_storage.sql`
- Create: `src/features/interactions/actions.ts`
- Create: `src/features/interactions/rules.ts`
- Create: `src/features/interactions/rules.test.ts`
- Create: `src/features/interactions/components/Comments.tsx`
- Create: `src/features/interactions/components/InlineAnnotationMenu.tsx`
- Modify: `src/features/journal/components/JournalReader.tsx`
- Modify: `src/features/notifications/actions.ts`
- Modify: `src/features/notifications/components/NotificationBell.tsx`

**Interfaces:**
- Produces: comments, annotations, replies, `future_diary_opened` notification.
- Consumes: full-content permission from Task 3; shared reader from Task 4.

- [ ] **Step 1: Write failing permission tests**

```ts
expect(canInteract({ entryType: "future", openedAt: null }, "recipient")).toBe(false);
expect(canInteract({ entryType: "future", openedAt: "2026-08-01T12:01:00Z" }, "recipient")).toBe(true);
expect(canInteract({ entryType: "future", openedAt: null }, "author")).toBe(false);
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/interactions/rules.test.ts`  
Expected: FAIL because shared interaction rules are absent.

- [ ] **Step 3: Implement tables, RLS, and actions**

Create `journal_comments`, `journal_annotations`, and `annotation_replies`, each with `space_id`, author ID, timestamps, text limits, and RLS. Interaction inserts require the entry to be a today diary or an opened future diary. Users may update/delete only their own comments within the approved ordinary-diary window. Annotations store quote, block identifier, and start/end offsets.

- [ ] **Step 4: Integrate reader interactions and notification idempotency**

Render comments chronologically with no nested comment tree. Text selection within one block opens the annotation action; selecting across blocks shows “请在同一段文字中选择内容”. Add a unique notification key `(recipient_id, type, source_id)` so repeated open requests create only one `future_diary_opened` notification.

- [ ] **Step 5: Verify interactions**

Run: `npm test -- src/features/interactions/rules.test.ts && npm run lint && npm run build`  
Expected: PASS and exit 0.

- [ ] **Step 6: Commit and stop**

```powershell
git add supabase/migrations/202607190003_interactions_and_storage.sql src/features/interactions src/features/journal/components/JournalReader.tsx src/features/notifications
git commit -m "feat: add private diary interactions"
```

### Task 8: Restore mood, calendar, memories, homepage, and settings around the new journal

**Files:**
- Create: `src/features/mood/actions.ts`
- Create: `src/app/(app)/mood/page.tsx`
- Modify: `src/features/calendar/actions.ts`
- Modify: `src/app/(app)/calendar/page.tsx`
- Create: `src/features/memories/repository.ts`
- Create: `src/app/(app)/memories/page.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/features/profile/actions.ts`
- Create: `src/features/home/components/FutureDiaryStatusCard.tsx`
- Create: `src/features/home/components/FutureDiaryStatusCard.test.tsx`

**Interfaces:**
- Produces: complete private product navigation and a safe homepage capsule status card.
- Consumes: journal public-card repository projection from Task 3.

- [ ] **Step 1: Write the homepage privacy test**

```tsx
render(<FutureDiaryStatusCard entry={{ authorName: "小丹", state: "waiting", openAt: "2026-08-01T12:00:00Z" }} />);
expect(screen.getByText(/小丹/)).toBeVisible();
expect(screen.getByText(/后开启/)).toBeVisible();
expect(screen.queryByText("未来日记的标题")).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/home/components/FutureDiaryStatusCard.test.tsx`  
Expected: FAIL because the safe status card is absent.

- [ ] **Step 3: Implement non-journal areas without expanding scope**

Mood posts remain short private text/emoji entries. Calendar supports shared events and approved recurrence. Memories is a chronological read model of published today diaries, opened future diaries, mood entries, and calendar memories; unopened future diaries never enter the memory feed. Settings handles only profile, avatar, relationship date, and display preferences.

- [ ] **Step 4: Integrate the safe homepage status**

Show the nearest ready future diary first; otherwise show the nearest waiting one. Render only sender and countdown before opening. Existing home sections may query in parallel, but no query may select protected future content for the recipient.

- [ ] **Step 5: Verify product integration**

Run: `npm test -- src/features/home/components/FutureDiaryStatusCard.test.tsx && npm run lint && npm run build`  
Expected: PASS and exit 0.

- [ ] **Step 6: Commit and stop**

```powershell
git add src/app/(app) src/features/mood src/features/calendar src/features/memories src/features/home src/features/profile
git commit -m "feat: integrate complete couple diary"
```

### Task 9: Add two-user end-to-end privacy and quota coverage

**Files:**
- Replace: `tests/e2e/couple-diary.spec.ts`
- Create: `tests/e2e/future-diary.spec.ts`
- Modify: `scripts/run-playwright-e2e.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces: browser-level evidence for login, separate quotas, sealed privacy, active opening, images, and interactions.
- Consumes: two seeded test accounts and a local Supabase/Next.js environment.

- [ ] **Step 1: Write the future-diary journey before implementation is declared complete**

```ts
test("future diary stays sealed until the recipient actively opens it", async ({ browser }) => {
  const author = await loginAs(browser, "author");
  const recipient = await loginAs(browser, "recipient");
  await createFutureDiary(author, { title: "给未来的你", body: "今天也很想你", openInSeconds: 2 });
  await expect(recipient.getByText("今天也很想你")).toHaveCount(0);
  await expect(recipient.getByRole("button", { name: "开启胶囊" })).toBeEnabled({ timeout: 5_000 });
  await recipient.getByRole("button", { name: "开启胶囊" }).click();
  await recipient.getByRole("button", { name: "确认开启" }).click();
  await expect(recipient.getByText("今天也很想你")).toBeVisible();
});
```

- [ ] **Step 2: Add independent-quota and authorization journeys**

In one Shanghai date, create one today diary and one future diary successfully, then verify a second of each type is rejected independently. Add direct navigation/API attempts proving that the recipient cannot read protected content before opening and the author cannot edit or delete a sealed future diary.

- [ ] **Step 3: Run the full automated suite**

Run: `npm test`  
Expected: all Vitest suites PASS.  
Run: `npm run lint && npm run build`  
Expected: both exit 0.  
Run: `npm run test:e2e`  
Expected: all Playwright journeys PASS on desktop and mobile projects.

- [ ] **Step 4: Commit and stop**

```powershell
git add tests/e2e scripts/run-playwright-e2e.ts playwright.config.ts
git commit -m "test: verify private future diary lifecycle"
```

### Task 10: Perform security, storage, responsive, and deployment acceptance

**Files:**
- Modify: `README.md`
- Modify: `.env.local.example`
- Create: `docs/operations/deployment-checklist.md`
- Create: `docs/operations/privacy-test-matrix.md`

**Interfaces:**
- Produces: reproducible setup, deployment, rollback, and manual privacy verification instructions.
- Consumes: all prior tasks.

- [ ] **Step 1: Document exact environment and deployment setup**

Document `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, database migration order, private bucket verification, two-account seeding, local commands, Vercel environment setup, and the rule that service-role keys never enter browser variables.

- [ ] **Step 2: Execute the manual permission matrix**

Verify as guest, author, designated recipient, and an authenticated non-member account: route access, metadata visibility, full-content visibility, image signing, open action, edit/delete action, comments, annotations, and notification access. Record PASS/FAIL for each role and state in `privacy-test-matrix.md`.

- [ ] **Step 3: Execute storage and responsive checks**

Upload valid JPEG/PNG/WebP images, reject GIF and files above limits, confirm no public object URL works, and confirm orphan cleanup after a forced save error. Test login, home, journal center, editors, countdown, opening, reader, comments, calendar, mood, memories, and settings at 375 px, 768 px, and 1440 px widths.

- [ ] **Step 4: Run the final release gate**

Run: `npm test && npm run lint && npm run build && npm run test:e2e`  
Expected: every command exits 0 with no failing test.  
Run: `git status --short`  
Expected: only intentionally preserved `desktop.ini` and `docs/audits/` may remain untracked.

- [ ] **Step 5: Commit documentation; deploy only after explicit approval**

```powershell
git add README.md .env.local.example docs/operations
git commit -m "docs: add couple diary release runbook"
```

Stop and request explicit approval before applying production migrations or deploying to Vercel. The rollback plan is to redeploy the previous verified commit and restore the pre-migration Supabase backup if a migration must be reversed.

