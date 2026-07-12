# Diary Core Lifecycle and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the editable-submitted-letter model with private drafts, scheduled time capsules, immutable publication, 24-hour withdrawal, idempotent automatic publishing, and faster home queries.

**Architecture:** Postgres owns lifecycle invariants through enums, constraints, RLS, and security-definer transition functions. Next.js server actions call narrow domain functions rather than updating letter rows directly. Home data is fetched in parallel through range-bounded queries, with performance marks recorded before and after.

**Tech Stack:** Supabase Postgres/RLS/pg_cron, Next.js 16 Server Actions, TypeScript, Vitest

## Global Constraints

- Preserve existing published letters by migrating them to `daily/published` with their original `submitted_at` as `published_at`.
- Published content is never mutable; withdrawal hides content but preserves interactions.
- Scheduled publishing and notification creation must be idempotent.
- All calendar calculations use Asia/Shanghai dates.

---

### Task 1: Add lifecycle validation as pure TypeScript

**Files:**
- Create: `src/features/letters/lifecycle.ts`
- Create: `src/features/letters/lifecycle.test.ts`
- Modify: `src/features/letters/rules.ts`

**Interfaces:**
- Produces: `LetterKind`, `LetterStatus`, `canWithdrawLetter(publishedAt, now)`, `validateSchedule(kind, scheduledFor, now)`, and `validateLetterPayload(input)`.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
import { describe, expect, it } from "vitest";
import { canWithdrawLetter, validateSchedule } from "./lifecycle";

describe("letter lifecycle", () => {
  it("allows withdrawal before exactly 24 hours", () => {
    expect(canWithdrawLetter("2026-07-13T00:00:00Z", new Date("2026-07-13T23:59:59Z"))).toBe(true);
    expect(canWithdrawLetter("2026-07-13T00:00:00Z", new Date("2026-07-14T00:00:01Z"))).toBe(false);
  });

  it("accepts future schedules and rejects past schedules", () => {
    expect(validateSchedule("time_capsule", "2026-07-14T08:30:00Z", new Date("2026-07-13T00:00:00Z"))).toEqual({ ok: true });
    expect(validateSchedule("time_capsule", "2026-07-12T08:30:00Z", new Date("2026-07-13T00:00:00Z")).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- src/features/letters/lifecycle.test.ts`  
Expected: FAIL because `lifecycle.ts` does not exist.

- [ ] **Step 3: Implement lifecycle helpers**

```ts
export type LetterKind = "daily" | "time_capsule";
export type LetterStatus = "draft" | "scheduled" | "published" | "withdrawn";

export function canWithdrawLetter(publishedAt: string, now = new Date()) {
  return now.getTime() <= new Date(publishedAt).getTime() + 24 * 60 * 60 * 1000;
}

export function validateSchedule(kind: LetterKind, scheduledFor: string | null, now = new Date()) {
  if (kind === "daily") return scheduledFor === null ? { ok: true as const } : { ok: false as const, message: "今日日记不能预约发布" };
  if (!scheduledFor || new Date(scheduledFor).getTime() <= now.getTime()) {
    return { ok: false as const, message: "请选择未来的日期和时间" };
  }
  return { ok: true as const };
}
```

- [ ] **Step 4: Run lifecycle tests**

Run: `npm test -- src/features/letters/lifecycle.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/letters/lifecycle.ts src/features/letters/lifecycle.test.ts src/features/letters/rules.ts
git commit -m "test: define letter lifecycle rules"
```

### Task 2: Migrate the Supabase schema and private storage

**Files:**
- Create: `supabase/migrations/202607130001_letter_lifecycle.sql`
- Create: `supabase/migrations/202607130002_letter_assets_bookmarks.sql`
- Create: `supabase/migrations/202607130003_scheduled_publication.sql`
- Test: Supabase SQL editor or migration runner plus `npm run build`

**Interfaces:**
- Produces: `letter_kind`, `letter_status`, new `letters` columns, `letter_assets`, `bookmarks`, `publish_daily_letter(uuid)`, `publish_due_letters()`, `withdraw_letter(uuid)`, and the private `letter-images` bucket.

- [ ] **Step 1: Write the lifecycle migration with explicit checks**

```sql
create type public.letter_kind as enum ('daily', 'time_capsule');
create type public.letter_status as enum ('draft', 'scheduled', 'published', 'withdrawn');
alter type public.notification_type add value if not exists 'letter_published';

alter table public.letters
  add column kind public.letter_kind not null default 'daily',
  add column status public.letter_status not null default 'published',
  add column salutation text not null default '亲爱的',
  add column body_json jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  add column body_text text not null default '',
  add column scheduled_for timestamptz,
  add column published_at timestamptz,
  add column withdrawn_at timestamptz,
  add column last_autosaved_at timestamptz,
  add column version integer not null default 1;

update public.letters
set body_text = body,
    body_json = jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',body))))),
    published_at = submitted_at;

alter table public.letters
  alter column body drop not null,
  alter column self_mood_value drop not null,
  alter column meal_value drop not null,
  alter column health_value drop not null,
  alter column submitted_at drop not null,
  alter column editable_until drop not null;

alter table public.letters drop constraint letters_author_id_letter_date_key;
create unique index letters_one_daily_per_author_day_idx
  on public.letters(author_id, letter_date)
  where kind = 'daily' and status in ('published','withdrawn');
create index letters_status_scheduled_for_idx on public.letters(status, scheduled_for);
create index letters_author_status_updated_idx on public.letters(author_id, status, updated_at desc);
```

- [ ] **Step 2: Add state-aware RLS and transition functions**

```sql
drop policy if exists "couple members can read letters" on public.letters;
drop policy if exists "users can edit own letter within 24 hours" on public.letters;

create policy "members read public letters and own private letters"
on public.letters for select to authenticated
using (
  ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true'
  and (status in ('published','withdrawn') or author_id = (select auth.uid()))
);

create policy "authors update private letters only"
on public.letters for update to authenticated
using (author_id = (select auth.uid()) and status in ('draft','scheduled'))
with check (author_id = (select auth.uid()) and status in ('draft','scheduled'));

create policy "authors delete private letters only"
on public.letters for delete to authenticated
using (author_id = (select auth.uid()) and status in ('draft','scheduled'));

grant delete on public.letters to authenticated;

create or replace function public.publish_daily_letter(target_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare changed integer;
begin
  update public.letters
  set status = 'published', published_at = now(), updated_at = now(), version = version + 1
  where id = target_id and author_id = auth.uid() and status = 'draft' and kind = 'daily'
    and letter_date = (now() at time zone 'Asia/Shanghai')::date
    and char_length(salutation) between 1 and 7
    and char_length(body_text) between 1 and 50000
    and char_length(seven_char_line) between 1 and 7
    and self_mood_value between 1 and 5
    and meal_value between 1 and 5
    and health_value between 1 and 5;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.withdraw_letter(target_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare changed integer;
begin
  update public.letters
  set status = 'withdrawn', withdrawn_at = now(), updated_at = now(), version = version + 1
  where id = target_id and author_id = auth.uid() and status = 'published'
    and published_at >= now() - interval '24 hours';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
```

- [ ] **Step 3: Add asset/bookmark tables and private bucket**

```sql
create table public.letter_assets (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sort_order integer not null default 0,
  upload_status text not null check (upload_status in ('uploading','ready','failed')),
  created_at timestamptz not null default now()
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  letter_id uuid not null references public.letters(id) on delete restrict,
  kind text not null check (kind in ('letter','excerpt')),
  block_id text,
  start_offset integer,
  end_offset integer,
  quoted_text text,
  created_at timestamptz not null default now(),
  unique(owner_id, letter_id, kind, block_id, start_offset, end_offset)
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('letter-images','letter-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

alter table public.letter_assets enable row level security;
alter table public.bookmarks enable row level security;

create policy "authors manage own letter assets" on public.letter_assets
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "members read assets for visible letters" on public.letter_assets
for select to authenticated
using (exists (
  select 1 from public.letters l where l.id = letter_id
  and (l.status = 'published' or (l.author_id = (select auth.uid()) and l.status in ('draft','scheduled')))
));

create policy "users manage own bookmarks" on public.bookmarks
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "owners upload private letter images" on storage.objects
for insert to authenticated
with check (bucket_id = 'letter-images' and owner = (select auth.uid()));

create or replace function public.can_read_letter_image(object_name text)
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.letter_assets a
    join public.letters l on l.id = a.letter_id
    where a.storage_path = object_name
      and (l.status = 'published' or (l.author_id = auth.uid() and l.status in ('draft','scheduled')))
  );
$$;

create policy "members read permitted letter images" on storage.objects
for select to authenticated
using (bucket_id = 'letter-images' and public.can_read_letter_image(name));
```

- [ ] **Step 4: Schedule the publisher and verify SQL invariants**

```sql
create or replace function public.publish_due_letters()
returns integer
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare changed integer;
begin
  with due as (
    update public.letters
    set status = 'published', published_at = now(), updated_at = now(), version = version + 1
    where status = 'scheduled' and scheduled_for <= now()
    returning id, author_id
  ), recipients as (
    insert into public.notifications(recipient_id, type, source_id, title, body)
    select p.id, 'letter_published', d.id, '一封未来的信到了', '去看看写给你的时间胶囊'
    from due d join public.profiles p on p.id <> d.author_id
    returning 1
  ) select count(*) into changed from due;
  return changed;
end;
$$;

create extension if not exists pg_cron;
select cron.schedule('publish-due-letters', '* * * * *', $$select public.publish_due_letters();$$);

select kind, status, count(*) from public.letters group by kind, status;
select public.publish_due_letters();
```

Expected: existing rows are `daily/published`; publisher returns `0` when nothing is due.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/202607130001_letter_lifecycle.sql supabase/migrations/202607130002_letter_assets_bookmarks.sql supabase/migrations/202607130003_scheduled_publication.sql
git commit -m "feat: add immutable letter lifecycle"
```

### Task 3: Replace direct writes with draft, schedule, publish, and withdraw actions

**Files:**
- Split: `src/features/letters/actions.ts`
- Create: `src/features/letters/queries.ts`
- Create: `src/features/letters/mutations.ts`
- Create: `src/features/letters/mutations.test.ts`

**Interfaces:**
- Produces: `saveDraftAction`, `scheduleLetterAction`, `publishDailyLetterAction`, `returnScheduledToDraftAction`, `deletePrivateLetterAction`, `withdrawPublishedLetterAction`.

- [ ] **Step 1: Write mutation contract tests with a fake repository**

```ts
it("never updates content after publication", async () => {
  const repo = fakeLetterRepo({ status: "published" });
  const result = await saveDraft(repo, userId, { id: letterId, version: 1, bodyText: "changed" });
  expect(result).toEqual({ ok: false, code: "LETTER_LOCKED" });
  expect(repo.update).not.toHaveBeenCalled();
});

it("rejects stale autosave versions", async () => {
  const repo = fakeLetterRepo({ status: "draft", version: 4 });
  expect((await saveDraft(repo, userId, { id: letterId, version: 3, bodyText: "old" })).code).toBe("VERSION_CONFLICT");
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- src/features/letters/mutations.test.ts`  
Expected: FAIL because mutation functions do not exist.

- [ ] **Step 3: Implement narrow action input schemas**

```ts
const draftSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["daily", "time_capsule"]),
  letterDate: z.string().date(),
  salutation: z.string().trim().min(1).max(7),
  bodyJson: z.record(z.string(), z.unknown()),
  bodyText: z.string().max(50000),
  sevenCharLine: z.string().trim().min(1).max(7),
  version: z.number().int().nonnegative(),
  sliders: z.object({ selfMoodValue: z.number().int().min(1).max(5), mealValue: z.number().int().min(1).max(5), healthValue: z.number().int().min(1).max(5) }).nullable(),
});
```

- [ ] **Step 4: Implement state-checked mutations and path revalidation**

Implementation rules:

```ts
if (existing.status !== "draft") return { ok: false, code: "LETTER_LOCKED", message: "这封信已经寄出，不能再修改" };
if (existing.version !== input.version) return { ok: false, code: "VERSION_CONFLICT", message: "草稿已在另一处更新，请刷新后重试" };
```

Call `publish_daily_letter` for daily publication and `withdraw_letter` for withdrawal; never issue a direct published-row content update.

- [ ] **Step 5: Run focused tests, lint, and build**

Run: `npm test -- src/features/letters/mutations.test.ts src/features/letters/lifecycle.test.ts`  
Expected: PASS.  
Run: `npm run lint && npm run build`  
Expected: both exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/features/letters/actions.ts src/features/letters/queries.ts src/features/letters/mutations.ts src/features/letters/mutations.test.ts
git commit -m "feat: add draft and publication actions"
```

### Task 4: Measure and remove home/login query waterfalls

**Files:**
- Create: `src/lib/performance/server-timing.ts`
- Create: `src/features/home/queries.ts`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/lib/auth/require-user.ts`
- Test: `src/features/home/queries.test.ts`

**Interfaces:**
- Produces: `getHomeSnapshot({ userId, year, month })` returning profiles, latest locations, heart states, event summary, and unread count.

- [ ] **Step 1: Record the baseline**

Run production locally with `npm run build && npm run start`, then run the existing authenticated Playwright flow three times. Record median login-to-home and home-navigation timings in `docs/performance/2026-07-13-baseline.md` without recording credentials.

- [ ] **Step 2: Write a query-shape test**

```ts
it("builds a bounded home snapshot", async () => {
  const result = await buildHomeSnapshot(fixtureRows, { start: "2026-07-01", end: "2026-07-31", viewerId: "a" });
  expect(result.days).toHaveLength(31);
  expect(result.days[0]).toMatchObject({ publicState: "a", privateState: false });
});
```

- [ ] **Step 3: Fetch independent data in parallel**

```ts
const [profilesResult, locationsResult, lettersResult, eventsResult, unreadResult] = await Promise.all([
  profilesQuery,
  latestLocationsQuery,
  rangeLettersQuery,
  eventsQuery,
  unreadCountQuery,
]);
```

Limit letters by the requested date range and select only fields consumed by the home snapshot.

- [ ] **Step 4: Remove side-effect notification generation from calendar reads**

Delete `ensureTodayEventNotifications()` calls from calendar queries. Generate event reminders through a dedicated scheduled database function so a page read never loops over profiles and notifications.

- [ ] **Step 5: Re-run performance and correctness checks**

Run: `npm test && npm run lint && npm run build`  
Expected: all exit 0.  
Repeat the three timing runs and append medians to `docs/performance/2026-07-13-baseline.md`.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/performance/server-timing.ts src/features/home/queries.ts src/features/home/queries.test.ts src/app/(app)/page.tsx src/lib/auth/require-user.ts src/features/calendar/actions.ts docs/performance/2026-07-13-baseline.md
git commit -m "perf: remove home query waterfalls"
```
