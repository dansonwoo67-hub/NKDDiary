# Couple Diary MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private two-person couple diary website that supports daily letters, seven-character preface, three-character response gate, unfolding letter view, comments/replies, shared calendar reminders, profile avatars, location-based distance, and deployment.

**Architecture:** Use a Next.js App Router application for the web UI and server actions. Use Supabase Auth for the two fixed accounts, Supabase Postgres for diary data, Supabase Storage for avatars, and Vercel for deployment. Keep domain rules in small pure TypeScript modules with tests, then connect those rules to server actions and UI.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Database/Storage, `@supabase/ssr`, `@supabase/supabase-js`, Zod, Vitest, Playwright, Vercel.

## Global Constraints

- System has exactly two fixed accounts; no open registration.
- Both users can see letters, comments, replies, calendar events, reminders, nicknames, and avatars.
- Each user can create at most one letter per natural day.
- A submitted letter can be edited for 24 hours; after 24 hours it becomes read-only.
- The website must not support diary deletion; UI must not show delete controls and data access must not grant delete permissions.
- Diary body is text-only in MVP; no image body, stickers, voice-to-text, custom emoji pack, points game, AI relationship agent, push notification, SMS, WeChat notification, or globe travel trail.
- Seven-character line is required and limited to 7 characters.
- Three-character response is required before opening the other person’s letter and limited to 3 characters.
- Slider levels are fixed:
  - `selfMoodValue`: 1 心碎小狗 🐶💧, 2 委屈趴窝 🥺, 3 原地待机 😐, 4 尾巴摇摇 🙂, 5 快乐转圈 😆
  - `mealValue`: 1 空盘哭哭 🍽️, 2 垫了一口 🥐, 3 认真干饭 🍚, 4 吃好啦 🍲, 5 圆滚滚 🐹
  - `healthValue`: 1 没动静 🚫, 2 蓄势待发 🫣, 3 一坨达成 💩, 4 双倍顺畅 💩💩, 5 串稀警报 🌊
- Location is only used to calculate distance; never show exact address, latitude, or longitude.
- Distance copy is fixed:
  - distance >= 100 km: `相爱隔山海，山海皆可平`
  - distance < 100 km: `朝夕相伴，暮暮朝朝`
  - missing location: `等待星球信号`
- Visual direction is Little Prince-inspired hand-drawn watercolor tone, with user-provided/static background asset slot; do not hardcode third-party copyrighted original artwork into the repository.
- Homepage keeps “在一起多少天” as the primary visual; today distance cannot compete with it.
- Mobile and desktop must both be usable.

---

## Scope Check

This MVP is one connected product loop rather than separate independent subsystems:

`login -> profile/avatar -> homepage -> write letter -> location capture -> open letter -> response -> annotation -> notification -> calendar回看`

The implementation is therefore planned as one deliverable, split into reviewable tasks. Each task has its own verification gate and commit.

## File Structure

Create or modify these focused files:

```text
package.json
package-lock.json
next.config.ts
tsconfig.json
src/app/layout.tsx
src/app/globals.css
src/app/(auth)/login/page.tsx
src/app/(app)/layout.tsx
src/app/(app)/page.tsx
src/app/(app)/write/page.tsx
src/app/(app)/letters/[date]/page.tsx
src/app/(app)/calendar/page.tsx
src/app/(app)/settings/page.tsx
src/proxy.ts
src/lib/supabase/client.ts
src/lib/supabase/proxy.ts
src/lib/supabase/server.ts
src/lib/auth/require-user.ts
src/lib/date/china-day.ts
src/lib/validation/text-limits.ts
src/features/profile/actions.ts
src/features/profile/components/ProfileForm.tsx
src/features/home/components/HomeHero.tsx
src/features/home/components/MonthHeatmap.tsx
src/features/home/daily-insights.ts
src/features/distance/distance.ts
src/features/distance/distance.test.ts
src/features/letters/rules.ts
src/features/letters/rules.test.ts
src/features/letters/actions.ts
src/features/letters/components/LetterEditor.tsx
src/features/letters/components/LetterReader.tsx
src/features/letters/components/LetterSliders.tsx
src/features/letters/components/SevenCharGate.tsx
src/features/annotations/actions.ts
src/features/annotations/components/AnnotationLayer.tsx
src/features/notifications/actions.ts
src/features/notifications/components/NotificationBell.tsx
src/features/calendar/recurrence.ts
src/features/calendar/recurrence.test.ts
src/features/calendar/actions.ts
src/features/calendar/components/EventDialog.tsx
src/features/calendar/components/EventIcon.tsx
supabase/migrations/202607100001_initial_schema.sql
supabase/seed.sql
scripts/seed-couple-users.ts
tests/e2e/couple-diary.spec.ts
playwright.config.ts
vitest.config.ts
.env.local.example
README.md
```

Main boundaries:

- `src/features/*/rules.ts` files hold pure business rules and are tested with Vitest.
- `src/features/*/actions.ts` files hold server actions and database writes.
- `src/features/*/components/*.tsx` files hold interactive UI only.
- `src/lib/supabase/*` files hide Supabase client creation and keep environment-variable access lazy.
- `src/app/*` files compose pages from feature components.

## Task 1: Scaffold Next.js app and visual foundation

**Files:**
- Create/modify: `package.json`
- Create/modify: `package-lock.json`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/features/home/components/HomeHero.tsx`
- Create: `.env.local.example`

**Interfaces:**
- Produces: `HomeHero(props: { daysTogether: number; distanceKm: number | null; distanceCopy: string; userA: AvatarPoint; userB: AvatarPoint })`
- Produces: CSS tokens `--paper`, `--ink`, `--rose`, `--star`, `--planet`, `--soft-blue`
- Consumes: no prior app code

- [ ] **Step 1: Scaffold the project**

Run:

```powershell
npx create-next-app@latest . --yes --force --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

Expected: Next.js project files are created under the current directory.

- [ ] **Step 2: Install runtime and test dependencies**

Run:

```powershell
npm install @supabase/ssr @supabase/supabase-js zod date-fns lucide-react clsx tailwind-merge framer-motion
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test tsx
```

Expected: `package.json` and `package-lock.json` include the installed packages.

- [ ] **Step 3: Add package scripts**

Modify `package.json` scripts so these commands exist:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: Create environment example**

Create `.env.local.example` with:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
COUPLE_USER_A_EMAIL=
COUPLE_USER_A_PASSWORD=
COUPLE_USER_A_DISPLAY_NAME=
COUPLE_USER_B_EMAIL=
COUPLE_USER_B_PASSWORD=
COUPLE_USER_B_DISPLAY_NAME=
NEXT_PUBLIC_RELATIONSHIP_START_DATE=2024-01-01
```

- [ ] **Step 5: Replace `src/app/globals.css` with the theme foundation**

Use these tokens and base styles:

```css
@import "tailwindcss";

:root {
  --paper: #fff8ea;
  --paper-deep: #f4e3bf;
  --ink: #47382d;
  --muted-ink: #8b7564;
  --rose: #e58b8f;
  --star: #f7cc6b;
  --planet: #d8e7cc;
  --soft-blue: #b9d3e8;
  --shadow-soft: 0 22px 80px rgb(83 61 43 / 14%);
}

html {
  background: var(--paper);
  color: var(--ink);
}

body {
  min-height: 100vh;
  background:
    radial-gradient(circle at 18% 12%, rgb(247 204 107 / 26%), transparent 26rem),
    radial-gradient(circle at 86% 22%, rgb(185 211 232 / 30%), transparent 24rem),
    linear-gradient(180deg, #fff8ea 0%, #f7ead4 100%);
}

button,
input,
textarea {
  font: inherit;
}

.hand-card {
  border: 1px solid rgb(71 56 45 / 14%);
  background: rgb(255 248 234 / 76%);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(10px);
}
```

- [ ] **Step 6: Create `HomeHero` visual shell**

Create `src/features/home/components/HomeHero.tsx`:

```tsx
export type AvatarPoint = {
  displayName: string
  avatarUrl: string | null
  x: number
  y: number
}

type HomeHeroProps = {
  daysTogether: number
  distanceKm: number | null
  distanceCopy: string
  userA: AvatarPoint
  userB: AvatarPoint
}

export function HomeHero({ daysTogether, distanceKm, distanceCopy, userA, userB }: HomeHeroProps) {
  const distanceText = distanceKm === null ? "等待星球信号" : `今日距离 ${distanceKm.toFixed(1)} km`

  return (
    <section className="relative overflow-hidden rounded-[2rem] px-6 py-8 hand-card">
      <div className="absolute inset-0 opacity-70">
        <div className="absolute left-[10%] top-[12%] h-3 w-3 rounded-full bg-[var(--star)]" />
        <div className="absolute right-[18%] top-[16%] h-2 w-2 rounded-full bg-[var(--star)]" />
        <div className="absolute bottom-[-18%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[var(--planet)]" />
      </div>

      <div className="relative z-10 text-center">
        <p className="text-sm tracking-[0.3em] text-[var(--muted-ink)]">我们已经在一起</p>
        <p className="mt-2 text-6xl font-semibold leading-none">{daysTogether}</p>
        <p className="mt-2 text-lg text-[var(--muted-ink)]">天</p>
      </div>

      {[userA, userB].map((user) => (
        <div
          key={user.displayName}
          className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
          style={{ left: `${user.x}%`, top: `${user.y}%` }}
        >
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-[var(--ink)]">
            {user.displayName}
          </span>
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border border-white/80 bg-white text-lg shadow-sm">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
            ) : (
              "♡"
            )}
          </div>
        </div>
      ))}

      <p className="relative z-10 mt-10 text-center text-sm text-[var(--muted-ink)]">
        {distanceText} · {distanceCopy}
      </p>
    </section>
  )
}
```

- [ ] **Step 7: Verify scaffold**

Run:

```powershell
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 8: Commit**

Run:

```powershell
git add package.json package-lock.json next.config.ts tsconfig.json src .env.local.example
git commit -m "chore: scaffold couple diary app"
```

## Task 2: Supabase schema, RLS, and avatar storage

**Files:**
- Create: `supabase/migrations/202607100001_initial_schema.sql`
- Create: `supabase/seed.sql`
- Create: `scripts/seed-couple-users.ts`

**Interfaces:**
- Produces tables: `profiles`, `letters`, `letter_open_responses`, `annotations`, `annotation_replies`, `calendar_events`, `notifications`
- Produces storage bucket: `avatars`
- Produces script: `npm run seed:couple-users`
- Consumes environment variables from `.env.local`

- [ ] **Step 1: Confirm Supabase CLI commands before use**

Run:

```powershell
supabase --help
supabase migration --help
```

Also check official Supabase changelog and SSR documentation before applying the migration. Expected: no breaking change blocks `@supabase/ssr`, RLS policies, Storage policies, or admin user seeding. If a breaking change exists, update this plan section with the official replacement before writing database code.

Expected: CLI help prints successfully. If the CLI is unavailable, create the SQL file and apply it from the Supabase dashboard SQL editor.

- [ ] **Step 2: Create migration SQL**

Create `supabase/migrations/202607100001_initial_schema.sql`:

```sql
create extension if not exists pgcrypto;

create type public.recurrence_type as enum ('none', 'monthly', 'yearly');
create type public.notification_type as enum ('annotation', 'annotation_reply', 'calendar_event', 'letter_opened');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  login_name text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar_url text,
  last_login_at timestamptz,
  last_login_latitude double precision,
  last_login_longitude double precision,
  relationship_started_on date not null default date '2024-01-01',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  letter_date date not null,
  body text not null check (char_length(body) between 1 and 20000),
  self_mood_value smallint not null check (self_mood_value between 1 and 5),
  meal_value smallint not null check (meal_value between 1 and 5),
  health_value smallint not null check (health_value between 1 and 5),
  seven_char_line text not null check (char_length(seven_char_line) between 1 and 7),
  latitude double precision,
  longitude double precision,
  location_recorded_at timestamptz,
  submitted_at timestamptz not null default now(),
  editable_until timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, letter_date)
);

create table public.letter_open_responses (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete restrict,
  reader_id uuid not null references public.profiles(id) on delete restrict,
  response_text text not null check (char_length(response_text) between 1 and 3),
  created_at timestamptz not null default now(),
  unique (letter_id, reader_id)
);

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  quoted_text text not null check (char_length(quoted_text) between 1 and 1000),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  comment text not null check (char_length(comment) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.annotation_replies (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references public.annotations(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 40),
  event_date date not null,
  recurrence public.recurrence_type not null default 'none',
  icon text not null check (char_length(icon) between 1 and 4),
  color text not null check (color in ('rose', 'gold', 'blue', 'green', 'purple')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  type public.notification_type not null,
  source_id uuid not null,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 240),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.lock_letter_window()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at = now();
    new.editable_until = new.submitted_at + interval '24 hours';
  elsif tg_op = 'UPDATE' then
    new.author_id = old.author_id;
    new.letter_date = old.letter_date;
    new.submitted_at = old.submitted_at;
    new.editable_until = old.editable_until;
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger letters_set_updated_at before update on public.letters
for each row execute function public.set_updated_at();

create trigger letters_lock_window before insert or update on public.letters
for each row execute function public.lock_letter_window();

create trigger annotations_set_updated_at before update on public.annotations
for each row execute function public.set_updated_at();

create trigger annotation_replies_set_updated_at before update on public.annotation_replies
for each row execute function public.set_updated_at();

create trigger calendar_events_set_updated_at before update on public.calendar_events
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.letters enable row level security;
alter table public.letter_open_responses enable row level security;
alter table public.annotations enable row level security;
alter table public.annotation_replies enable row level security;
alter table public.calendar_events enable row level security;
alter table public.notifications enable row level security;

create policy "couple members can read profiles"
on public.profiles for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can update own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read letters"
on public.letters for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can insert own letter"
on public.letters for insert to authenticated
with check (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can edit own letter within 24 hours"
on public.letters for update to authenticated
using (author_id = (select auth.uid()) and now() <= editable_until and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (author_id = (select auth.uid()) and now() <= editable_until and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read open responses"
on public.letter_open_responses for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create own open response"
on public.letter_open_responses for insert to authenticated
with check (reader_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read annotations"
on public.annotations for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create own annotations"
on public.annotations for insert to authenticated
with check (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can update own annotations"
on public.annotations for update to authenticated
using (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read annotation replies"
on public.annotation_replies for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create own annotation replies"
on public.annotation_replies for insert to authenticated
with check (author_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can read calendar events"
on public.calendar_events for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "couple members can create calendar events"
on public.calendar_events for insert to authenticated
with check (creator_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "event creator can update calendar events"
on public.calendar_events for update to authenticated
using (creator_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (creator_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can read own notifications"
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can update own notifications"
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (recipient_id = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

grant usage on schema public to authenticated;
grant select on public.profiles, public.letters, public.letter_open_responses, public.annotations, public.annotation_replies, public.calendar_events, public.notifications to authenticated;
grant update (display_name, avatar_url, last_login_at, last_login_latitude, last_login_longitude, updated_at) on public.profiles to authenticated;
grant insert on public.letters, public.letter_open_responses, public.annotations, public.annotation_replies, public.calendar_events to authenticated;
grant update (body, self_mood_value, meal_value, health_value, seven_char_line, latitude, longitude, location_recorded_at, updated_at) on public.letters to authenticated;
grant update (quoted_text, start_offset, end_offset, comment, updated_at) on public.annotations to authenticated;
grant update (name, event_date, recurrence, icon, color, updated_at) on public.calendar_events to authenticated;
grant update (is_read) on public.notifications to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "couple members can read avatars"
on storage.objects for select to authenticated
using (bucket_id = 'avatars' and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can upload own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and owner = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

create policy "users can update own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true')
with check (bucket_id = 'avatars' and owner = (select auth.uid()) and ((select auth.jwt()) -> 'app_metadata' ->> 'nkd_diary_member') = 'true');

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.lock_letter_window() from public;
```

- [ ] **Step 3: Create seed helper**

Create `scripts/seed-couple-users.ts`:

```ts
import { createClient } from "@supabase/supabase-js"

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "COUPLE_USER_A_EMAIL",
  "COUPLE_USER_A_PASSWORD",
  "COUPLE_USER_A_DISPLAY_NAME",
  "COUPLE_USER_B_EMAIL",
  "COUPLE_USER_B_PASSWORD",
  "COUPLE_USER_B_DISPLAY_NAME",
] as const

for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function upsertUser(email: string, password: string, displayName: string, loginName: string) {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { nkd_diary_member: "true" },
  })

  if (createError && !createError.message.includes("already registered")) {
    throw createError
  }

  const userId =
    created.user?.id ??
    (await supabase.auth.admin.listUsers()).data.users.find((user) => user.email === email)?.id

  if (!userId) throw new Error(`Cannot find user ${email}`)

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    login_name: loginName,
    display_name: displayName,
    relationship_started_on: process.env.NEXT_PUBLIC_RELATIONSHIP_START_DATE ?? "2024-01-01",
  })

  if (profileError) throw profileError
}

async function main() {
  await upsertUser(
    process.env.COUPLE_USER_A_EMAIL!,
    process.env.COUPLE_USER_A_PASSWORD!,
    process.env.COUPLE_USER_A_DISPLAY_NAME!,
    "user_a",
  )
  await upsertUser(
    process.env.COUPLE_USER_B_EMAIL!,
    process.env.COUPLE_USER_B_PASSWORD!,
    process.env.COUPLE_USER_B_DISPLAY_NAME!,
    "user_b",
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 4: Add seed script**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "seed:couple-users": "tsx scripts/seed-couple-users.ts"
  }
}
```

If `tsx` is not installed, run:

```powershell
npm install -D tsx
```

- [ ] **Step 5: Verify schema**

Run after connecting to Supabase:

```powershell
supabase db push
npm run seed:couple-users
```

Expected: all tables exist, two auth users exist, two profile rows exist, and no diary table has a delete policy.

- [ ] **Step 6: Commit**

Run:

```powershell
git add supabase scripts package.json package-lock.json
git commit -m "feat: add Supabase schema and couple users seed"
```

## Task 3: Auth, session protection, and profile editing

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/auth/require-user.ts`
- Create: `src/proxy.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/features/profile/actions.ts`
- Create: `src/features/profile/components/ProfileForm.tsx`
- Create: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Produces: `createBrowserSupabaseClient()`
- Produces: `createServerSupabaseClient()`
- Produces: `requireUser(): Promise<{ userId: string; profile: Profile }>`
- Produces: `updateProfileAction(formData: FormData): Promise<ActionResult>`
- Produces: `recordLoginLocationAction(input: { latitude: number; longitude: number }): Promise<ActionResult>`

- [ ] **Step 1: Create lazy Supabase clients**

Create clients that read env vars inside functions, not at module initialization:

```ts
// src/lib/supabase/client.ts
"use client"

import { createBrowserClient } from "@supabase/ssr"

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
```

```ts
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
}
```

- [ ] **Step 2: Create auth guard**

Create `src/lib/auth/require-user.ts`:

```ts
import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function requireUser() {
  const supabase = await createServerSupabaseClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (claimsError || !userId) redirect("/login")

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single()

  if (profileError || !profile) redirect("/login")

  return { userId, profile }
}
```

Create `src/lib/supabase/proxy.ts` and `src/proxy.ts` using the current Supabase SSR cookie-refresh pattern from the official Supabase Next.js server-side auth guide. The proxy may redirect unauthenticated app routes to `/login`, but every protected Server Component and Server Action must still call `requireUser()`.

- [ ] **Step 3: Create login page and logout action**

The login page must only offer sign-in; it must not show sign-up. After login, redirect to `/`.

- [ ] **Step 4: Create profile form**

The settings page must allow:

- edit display name;
- upload avatar to `avatars/<userId>/avatar.<ext>`;
- update `profiles.avatar_url`;
- never expose `SUPABASE_SECRET_KEY` to browser code.

- [ ] **Step 5: Verify auth**

Run:

```powershell
npm run build
```

Expected: build exits with code 0.

Manual browser checks:

- logged-out user visiting `/` redirects to `/login`;
- login page has no registration path;
- each fixed account can log in;
- each account can edit its own nickname and avatar;
- one account cannot overwrite the other account’s profile.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src package.json package-lock.json
git commit -m "feat: add auth and profile settings"
```

## Task 4: Core domain rules for text limits, edit window, recurrence, and distance

**Files:**
- Create: `src/lib/validation/text-limits.ts`
- Create: `src/lib/date/china-day.ts`
- Create: `src/features/letters/rules.ts`
- Create: `src/features/letters/rules.test.ts`
- Create: `src/features/distance/distance.ts`
- Create: `src/features/distance/distance.test.ts`
- Create: `src/features/calendar/recurrence.ts`
- Create: `src/features/calendar/recurrence.test.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `countCharacters(value: string): number`
- Produces: `validateSevenCharLine(value: string): string`
- Produces: `validateOpenResponse(value: string): string`
- Produces: `canEditLetter(now: Date, editableUntil: Date): boolean`
- Produces: `calculateEditableUntil(submittedAt: Date): Date`
- Produces: `calculateDistanceKm(a: Coordinates, b: Coordinates): number`
- Produces: `getDistanceCopy(distanceKm: number | null): string`
- Produces: `resolveRecurringEventDate(eventDate: Date, targetYear: number, targetMonth: number): Date`

- [ ] **Step 1: Create text utilities**

```ts
// src/lib/validation/text-limits.ts
export function countCharacters(value: string) {
  return Array.from(value.trim()).length
}

export function requireCharacterRange(value: string, min: number, max: number, label: string) {
  const count = countCharacters(value)
  if (count < min) throw new Error(`${label}不能为空`)
  if (count > max) throw new Error(`${label}最多${max}个字`)
  return value.trim()
}
```

- [ ] **Step 2: Create letter rules**

```ts
// src/features/letters/rules.ts
import { requireCharacterRange } from "@/lib/validation/text-limits"

export function validateSevenCharLine(value: string) {
  return requireCharacterRange(value, 1, 7, "今日七字信")
}

export function validateOpenResponse(value: string) {
  return requireCharacterRange(value, 1, 3, "三字回应")
}

export function calculateEditableUntil(submittedAt: Date) {
  return new Date(submittedAt.getTime() + 24 * 60 * 60 * 1000)
}

export function canEditLetter(now: Date, editableUntil: Date) {
  return now.getTime() <= editableUntil.getTime()
}
```

- [ ] **Step 3: Write failing tests for letter rules**

```ts
// src/features/letters/rules.test.ts
import { describe, expect, it } from "vitest"
import { calculateEditableUntil, canEditLetter, validateOpenResponse, validateSevenCharLine } from "./rules"

describe("letter rules", () => {
  it("limits seven-character line to 7 characters", () => {
    expect(validateSevenCharLine("想你啦")).toBe("想你啦")
    expect(() => validateSevenCharLine("一二三四五六七八")).toThrow("最多7个字")
  })

  it("requires open response and limits it to 3 characters", () => {
    expect(validateOpenResponse("抱抱")).toBe("抱抱")
    expect(() => validateOpenResponse("抱抱你呀")).toThrow("最多3个字")
  })

  it("allows editing within 24 hours and locks after", () => {
    const submittedAt = new Date("2026-07-10T10:00:00+08:00")
    const editableUntil = calculateEditableUntil(submittedAt)
    expect(canEditLetter(new Date("2026-07-11T09:59:59+08:00"), editableUntil)).toBe(true)
    expect(canEditLetter(new Date("2026-07-11T10:00:01+08:00"), editableUntil)).toBe(false)
  })
})
```

- [ ] **Step 4: Create distance utilities**

```ts
// src/features/distance/distance.ts
export type Coordinates = {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_KM = 6371

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

export function calculateDistanceKm(a: Coordinates, b: Coordinates) {
  const deltaLatitude = toRadians(b.latitude - a.latitude)
  const deltaLongitude = toRadians(b.longitude - a.longitude)
  const startLatitude = toRadians(a.latitude)
  const endLatitude = toRadians(b.latitude)

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function getDistanceCopy(distanceKm: number | null) {
  if (distanceKm === null) return "等待星球信号"
  return distanceKm >= 100 ? "相爱隔山海，山海皆可平" : "朝夕相伴，暮暮朝朝"
}
```

- [ ] **Step 5: Test distance copy thresholds**

```ts
// src/features/distance/distance.test.ts
import { describe, expect, it } from "vitest"
import { calculateDistanceKm, getDistanceCopy } from "./distance"

describe("distance", () => {
  it("calculates approximate kilometers", () => {
    const shanghai = { latitude: 31.2304, longitude: 121.4737 }
    const hangzhou = { latitude: 30.2741, longitude: 120.1551 }
    expect(calculateDistanceKm(shanghai, hangzhou)).toBeGreaterThan(150)
  })

  it("returns configured copy", () => {
    expect(getDistanceCopy(null)).toBe("等待星球信号")
    expect(getDistanceCopy(99.9)).toBe("朝夕相伴，暮暮朝朝")
    expect(getDistanceCopy(100)).toBe("相爱隔山海，山海皆可平")
  })
})
```

- [ ] **Step 6: Create recurrence utility and tests**

Use this rule: if a monthly/yearly reminder lands on an invalid day, use that month’s last day.

```ts
// src/features/calendar/recurrence.ts
function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function resolveRecurringEventDate(eventDate: Date, targetYear: number, targetMonthIndex: number) {
  const originalDay = eventDate.getDate()
  const safeDay = Math.min(originalDay, lastDayOfMonth(targetYear, targetMonthIndex))
  return new Date(targetYear, targetMonthIndex, safeDay)
}
```

```ts
// src/features/calendar/recurrence.test.ts
import { describe, expect, it } from "vitest"
import { resolveRecurringEventDate } from "./recurrence"

describe("recurrence", () => {
  it("uses the same day when the target month has that day", () => {
    expect(resolveRecurringEventDate(new Date(2026, 0, 30), 2026, 6).getDate()).toBe(30)
  })

  it("uses month end when the target month lacks that day", () => {
    const resolved = resolveRecurringEventDate(new Date(2026, 0, 30), 2026, 1)
    expect(resolved.getFullYear()).toBe(2026)
    expect(resolved.getMonth()).toBe(1)
    expect(resolved.getDate()).toBe(28)
  })
})
```

- [ ] **Step 7: Verify rules**

Run:

```powershell
npm run test -- src/features/letters/rules.test.ts src/features/distance/distance.test.ts src/features/calendar/recurrence.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src vitest.config.ts package.json package-lock.json
git commit -m "feat: add diary domain rules"
```

## Task 5: Letter editor with sliders, geolocation, event shortcut, and 24-hour lock

**Files:**
- Create: `src/features/letters/actions.ts`
- Create: `src/features/letters/components/LetterSliders.tsx`
- Create: `src/features/letters/components/LetterEditor.tsx`
- Create: `src/app/(app)/write/page.tsx`
- Modify: `src/features/calendar/actions.ts`
- Modify: `src/features/calendar/components/EventDialog.tsx`

**Interfaces:**
- Produces: `saveLetterAction(input: SaveLetterInput): Promise<ActionResult>`
- Produces: `getTodayLetterForEditor(): Promise<EditorLetterState>`
- Consumes: `validateSevenCharLine`, `canEditLetter`
- Consumes: `createCalendarEventAction`

- [ ] **Step 1: Define action input shape**

Create this exported type in `src/features/letters/actions.ts`:

```ts
export type SaveLetterInput = {
  body: string
  selfMoodValue: number
  mealValue: number
  healthValue: number
  sevenCharLine: string
  latitude?: number
  longitude?: number
  locationRecordedAt?: string
}
```

- [ ] **Step 2: Implement `saveLetterAction`**

Rules inside the action:

- require logged-in user;
- use China date for `letter_date`;
- if no letter exists today, insert;
- if letter exists and `now <= editable_until`, update allowed fields;
- if letter exists and `now > editable_until`, return `{ ok: false, message: "这封信已经封存啦，不能再编辑。" }`;
- never expose a delete action.

- [ ] **Step 3: Build `LetterSliders`**

The component must render exactly the three fixed five-level sliders from Global Constraints and store values 1 through 5.

- [ ] **Step 4: Build `LetterEditor`**

The flow must be:

1. sliders;
2. body textarea;
3. optional “顺手记到日历” button;
4. final seven-character line;
5. save button.

When the browser supports location, ask:

`仅用于计算今日距离，不展示具体位置。`

If location fails, allow saving without location.

- [ ] **Step 5: Verify editor behavior**

Run:

```powershell
npm run test
npm run build
```

Manual browser checks:

- a user can create today’s letter;
- the same user reopens `/write` and edits the same letter within 24 hours;
- after `editable_until` is manually moved to the past in database, `/write` shows read-only state;
- there is no delete button.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src
git commit -m "feat: add locked daily letter editor"
```

## Task 6: Letter reader with seven-character preface and three-character response gate

**Files:**
- Create: `src/features/letters/components/SevenCharGate.tsx`
- Create: `src/features/letters/components/LetterReader.tsx`
- Modify: `src/features/letters/actions.ts`
- Create: `src/app/(app)/letters/[date]/page.tsx`

**Interfaces:**
- Produces: `createOpenResponseAction(input: { letterId: string; responseText: string }): Promise<ActionResult>`
- Produces: `getLettersForDate(date: string): Promise<LetterDayView>`
- Consumes: `validateOpenResponse`

- [ ] **Step 1: Add open response action**

Rules:

- response is required;
- response is limited to 3 characters;
- response is saved once per `letter_id + reader_id`;
- after response exists, user may view the full letter again without responding again;
- create a `letter_opened` notification for the letter author.

- [ ] **Step 2: Build gate UI**

Before展信:

- show author nickname/avatar;
- show `sevenCharLine`;
- show quick choices: `抱抱`, `我也`, `亲亲`, `收到`, `想你`;
- allow custom response up to 3 characters;
- disable open button until response is valid.

- [ ] **Step 3: Build unfold animation**

Use `framer-motion` to animate from folded letter to open letter. Keep motion slow and gentle.

- [ ] **Step 4: Verify reader**

Run:

```powershell
npm run build
```

Manual browser checks:

- user B cannot see user A’s letter body before three-character response;
- user B can submit a valid response and see unfolded body;
- invalid response over 3 characters is rejected;
- reopening the same letter does not ask again;
- user A receives a station notification after user B opens the letter.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src
git commit -m "feat: add response-gated letter reader"
```

## Task 7: Annotation, comment replies, and station notifications

**Files:**
- Create: `src/features/annotations/actions.ts`
- Create: `src/features/annotations/components/AnnotationLayer.tsx`
- Create: `src/features/notifications/actions.ts`
- Create: `src/features/notifications/components/NotificationBell.tsx`
- Modify: `src/features/letters/components/LetterReader.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: `createAnnotationAction(input: { letterId: string; quotedText: string; startOffset: number; endOffset: number; comment: string }): Promise<ActionResult>`
- Produces: `createAnnotationReplyAction(input: { annotationId: string; body: string }): Promise<ActionResult>`
- Produces: `markNotificationReadAction(id: string): Promise<ActionResult>`
- Produces: `getUnreadNotifications(): Promise<Notification[]>`

- [ ] **Step 1: Implement annotation action**

Rules:

- selected text must be non-empty;
- comment must be non-empty and at most 2000 characters;
- store `quoted_text`, `start_offset`, `end_offset`;
- create `annotation` notification for the original letter author.

- [ ] **Step 2: Implement reply action**

Rules:

- reply body must be non-empty and at most 2000 characters;
- create `annotation_reply` notification for the other participant in that annotation thread.

- [ ] **Step 3: Build annotation UI**

The reader can select text, click “评点”, enter a comment, and see underlined/highlighted quoted text. If offsets no longer match due to a letter edit, show the stored `quoted_text` with copy `原文已修改`.

- [ ] **Step 4: Build notification bell**

Rules:

- unread red dot;
- list sorted newest first by `created_at`;
- click notification marks read;
- click jumps to original letter date and source anchor.

- [ ] **Step 5: Verify annotations**

Run:

```powershell
npm run build
```

Manual browser checks:

- user B comments on user A’s letter;
- user A sees unread reminder;
- user A opens reminder and lands on the original letter;
- user A replies;
- user B sees reply reminder.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src
git commit -m "feat: add letter annotations and notifications"
```

## Task 8: Shared calendar events, reminders, and monthly heatmap

**Files:**
- Create: `src/features/calendar/actions.ts`
- Create: `src/features/calendar/components/EventDialog.tsx`
- Create: `src/features/calendar/components/EventIcon.tsx`
- Create: `src/features/home/components/MonthHeatmap.tsx`
- Create: `src/app/(app)/calendar/page.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/features/letters/components/LetterEditor.tsx`

**Interfaces:**
- Produces: `createCalendarEventAction(input: CalendarEventInput): Promise<ActionResult>`
- Produces: `getMonthCalendarState(year: number, month: number): Promise<MonthCalendarState>`
- Consumes: `resolveRecurringEventDate`

- [ ] **Step 1: Implement event creation**

`CalendarEventInput`:

```ts
export type CalendarEventInput = {
  name: string
  eventDate: string
  recurrence: "none" | "monthly" | "yearly"
  icon: string
  color: "rose" | "gold" | "blue" | "green" | "purple"
}
```

Rules:

- both users can see all events;
- event name is required and limited to 40 characters;
- supported recurrence values are exactly `none`, `monthly`, `yearly`;
- supported colors are exactly `rose`, `gold`, `blue`, `green`, `purple`;
- event reminders create station notifications when due and visible after login.

- [ ] **Step 2: Build event dialog**

Provide common icon choices:

```ts
export const EVENT_ICONS = ["🌹", "🎂", "✈️", "💌", "🩸", "⭐", "🍽️", "🏥"]
```

- [ ] **Step 3: Build month heatmap**

Rules:

- natural month grid;
- date color depth reflects record heat;
- show up to 2 event icons inside a date cell;
- show a small dot if more than 2 events exist;
- click date opens letters for that date.

- [ ] **Step 4: Verify calendar**

Run:

```powershell
npm run test -- src/features/calendar/recurrence.test.ts
npm run build
```

Manual browser checks:

- create a monthly period reminder;
- create a yearly birthday reminder;
- create a one-time trip reminder;
- both users can see all three events;
- icons appear on the homepage month grid.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src
git commit -m "feat: add shared calendar reminders"
```

## Task 9: Homepage assembly with days-together hero, distance, daily insight, month calendar, and reminders

**Files:**
- Create: `src/features/home/daily-insights.ts`
- Modify: `src/features/home/components/HomeHero.tsx`
- Modify: `src/features/home/components/MonthHeatmap.tsx`
- Modify: `src/features/notifications/components/NotificationBell.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `calculateDistanceKm`
- Consumes: `getDistanceCopy`
- Consumes: `getMonthCalendarState`
- Consumes: `getUnreadNotifications`

- [ ] **Step 1: Add daily insight sentence bank**

Create `src/features/home/daily-insights.ts`:

```ts
export const DAILY_INSIGHTS = [
  "亲密关系里，稳定的回应比盛大的承诺更有力量。",
  "爱不是猜中对方所有心事，而是愿意多问一句：你今天还好吗？",
  "好的关系会让人变小孩，也会让人更勇敢地长大。",
  "争吵后的修复，常常比不争吵更能决定关系的温度。",
  "被认真听见，是很日常、也很奢侈的浪漫。",
  "想念不是距离的反义词，回应才是。",
  "长期相爱，是把很多普通日子过成只属于两个人的暗号。",
]

export function getDailyInsight(date: Date) {
  const index = Math.abs(date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate()) % DAILY_INSIGHTS.length
  return DAILY_INSIGHTS[index]
}
```

- [ ] **Step 2: Assemble homepage**

Homepage must show:

- `HomeHero` with days-together as primary visual;
- integrated today distance text without card/background;
- notification entry;
- monthly heatmap;
- daily insight sentence.

- [ ] **Step 3: Position avatars from distance**

Rules:

- if distance is missing, place two avatars gently apart on the rose planet;
- if distance < 100 km, place avatars close;
- if distance >= 100 km, place avatars farther apart;
- labels use user display names, not “小王子” or “小狐狸”.

- [ ] **Step 4: Verify homepage**

Run:

```powershell
npm run build
```

Manual browser checks:

- days-together is the largest visual number;
- distance does not use a text box or colored card;
- avatars show user nicknames;
- exact coordinates never appear on screen;
- daily insight updates by date;
- month heatmap links to letter dates.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src
git commit -m "feat: assemble couple diary homepage"
```

## Task 10: End-to-end tests, production readiness, and deployment handoff

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/couple-diary.spec.ts`
- Modify: `README.md`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes all prior routes/actions/components.
- Produces a deployment checklist for Vercel and Supabase.

- [ ] **Step 1: Configure Playwright**

Create `playwright.config.ts` with:

```ts
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
})
```

- [ ] **Step 2: Write E2E happy path**

The test should cover:

- user A logs in;
- user A writes today’s letter;
- user B logs in;
- user B sees seven-character line before body;
- user B sends three-character response;
- user B sees unfolded body;
- user B comments;
- user A sees notification;
- calendar shows today as recorded.

- [ ] **Step 3: Write E2E lock path**

The test should cover:

- a letter older than 24 hours cannot be edited;
- no delete control is visible on editor, reader, or calendar pages.

- [ ] **Step 4: Add README handoff**

`README.md` must explain:

- required environment variables;
- how to run locally;
- how to apply Supabase migration;
- how to seed two users;
- how to deploy to Vercel;
- how to set Supabase URL and publishable key in Vercel;
- that `SUPABASE_SECRET_KEY` is server-only and must never be exposed as `NEXT_PUBLIC_*`;
- that user-provided background art can be added later through the static asset slot.

- [ ] **Step 5: Run full verification**

Run:

```powershell
npm run test
npm run build
npx playwright test
```

Expected: unit tests pass, production build passes, E2E tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add README.md .env.local.example playwright.config.ts tests package.json package-lock.json src
git commit -m "test: add couple diary end-to-end coverage"
```

## Self-Review

### Spec coverage

- Two fixed users: Task 2 and Task 3.
- Independent login: Task 3.
- Avatar and display name: Task 3.
- Daily diary with fixed sliders, body, event shortcut, seven-character line: Task 4 and Task 5.
- No custom tags: Task 5 does not include a tags field or UI.
- Twenty-four-hour edit window and no deletion: Task 2, Task 4, Task 5, Task 10.
- 展信 gate: Task 6.
- Three-character response: Task 4 and Task 6.
- Annotation, comments, replies, notifications: Task 7.
- Monthly heatmap and event icons: Task 8 and Task 9.
- Shared calendar reminders: Task 8.
- Distance feature and privacy: Task 4 and Task 9.
- Daily love insight: Task 9.
- Little Prince-inspired static visual tone without hardcoded copyrighted art: Task 1 and Task 9.
- Deployment readiness: Task 10.
- Excluded MVP features are not scheduled as tasks.

### Placeholder scan

The plan avoids open-ended markers and defines concrete files, commands, interfaces, and validation rules. Any worker executing this plan should replace broad manual checks with concrete automated tests as soon as the relevant UI exists.

### Type consistency

- Letter rule names match across tasks: `validateSevenCharLine`, `validateOpenResponse`, `canEditLetter`, `calculateEditableUntil`.
- Distance names match across tasks: `calculateDistanceKm`, `getDistanceCopy`.
- Calendar recurrence name matches across tasks: `resolveRecurringEventDate`.
- Server action names match page/component consumers: `saveLetterAction`, `createOpenResponseAction`, `createAnnotationAction`, `createAnnotationReplyAction`, `createCalendarEventAction`, `markNotificationReadAction`.
