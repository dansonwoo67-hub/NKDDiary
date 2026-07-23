# Couple Diary deployment checklist

**Release state:** preparation only. This document does not authorize a
production migration or Vercel deployment. Obtain explicit approval immediately
before either action.

## 1. Local environment and accounts

From the repository root, run `Copy-Item .env.local.example .env.local`, then
populate `.env.local`. Keep that file untracked.

| Variable | Where it is used | Handling |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server Supabase clients | Required; public project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server user-session clients | Required; public Supabase publishable key. The code does **not** read `NEXT_PUBLIC_SUPABASE_ANON_KEY`. For projects still issuing a legacy anon key, put that key's value in this publishable-key variable. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side comment create/update actions | Required in Vercel only as a server secret; never use a `NEXT_PUBLIC_` name. |
| `SUPABASE_SECRET_KEY` | Local `npm run seed:couple-users` only | Required locally for Auth admin calls; never configure in Vercel or browser code. |
| `COUPLE_USER_A_ID`, `COUPLE_USER_B_ID` | Local seed script | UUIDs of two distinct, already-created Supabase Auth users. |
| `COUPLE_USER_A_DISPLAY_NAME`, `COUPLE_USER_B_DISPLAY_NAME` | Local seed script | Required display names. |
| `NEXT_PUBLIC_RELATIONSHIP_START_DATE` | Countdown UI and seed profile data | Public date, formatted `YYYY-MM-DD`. |

Before seeding, create both Auth users in the Supabase dashboard and retain
their UUIDs. The seed script does not create Auth users or passwords; it sets
the membership claim, profiles, the fixed couple space, and two active
memberships. Run:

```powershell
npm run seed:couple-users
```

Record the two test accounts and a third authenticated account with neither the
membership claim nor a `space_members` row. The third account is required for
the non-member rows in the privacy matrix.

## 2. Database and Storage preparation

Take a recoverable Supabase backup/snapshot before applying any migration. In
the Supabase SQL editor or the team's approved migration mechanism, apply these
files in this exact lexicographic order and stop on the first error:

```text
supabase/migrations/202607100001_initial_schema.sql
supabase/migrations/202607100002_harden_security_and_indexes.sql
supabase/migrations/202607190001_rebuild_core.sql
supabase/migrations/202607190002_journal_functions.sql
supabase/migrations/202607190003_interactions_and_storage.sql
supabase/migrations/202607190004_product_integration.sql
```

After the migrations, inspect the Supabase Storage dashboard and record the
result in the privacy matrix:

- The `journal-images` bucket exists and is **not public**.
- Its server-side object limit is `819200` bytes (800 KiB).
- Its allowed stored MIME type is `image/webp`; the browser converts accepted
  JPEG, PNG, and WebP source images before upload.
- Anonymous and authenticated users cannot obtain a public object URL; reads
  use a permission-checked signed URL with a 300-second lifetime.
- Storage object policies and the cleanup queue were created by migration
  `202607190003_interactions_and_storage.sql`.

Do not claim these checks passed merely because the SQL files exist. They need a
real project and a dashboard/API observation.

## 3. Local release checks

Run the commands below with the two seeded accounts and all required Supabase
variables available. Capture command output with the release record.

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
git status --short
```

The release gate passes only when every first four command exits with code zero
and there are no failing tests. The E2E runner intentionally fails (after an
unauthenticated smoke test) when its real integration prerequisites are absent;
that is a blocked release gate, not a skipped pass. `git status --short` must
show only intentionally preserved `desktop.ini` and `docs/audits/` untracked
items, if any.

## 4. Manual acceptance

Complete every `NOT RUN` row in
[privacy-test-matrix.md](privacy-test-matrix.md), including all four roles:
guest, author, designated recipient, and authenticated non-member. Do not
release with an unexpected `FAIL` or an uninvestigated `NOT RUN`.

### Image and cleanup checks

Use an author account to add an image in both a today diary and a future diary.
For each result, record `PASS`, `FAIL`, or `NOT RUN` in the matrix.

1. Select valid JPEG, PNG, and WebP source images below 10 MiB. Each should
   compress to WebP and be accepted only when its output is at most 800 KiB.
2. Select a GIF and a source image over 10 MiB. Both must be rejected before a
   journal image is persisted. A compressed WebP over 800 KiB must also fail.
3. From a signed-in browser and a separate private/incognito browser, attempt a
   guessed direct `journal-images` object URL. It must not yield a public image.
   Confirm an authorized reader receives only a 300-second signed URL after
   full-content permission succeeds.
4. Force a database diary-write failure after a new image upload in a disposable
   non-production project (for example, temporarily use an invalid required
   entry value while retaining an otherwise valid upload request). Confirm the
   uploaded canonical object is removed, or that a cleanup job is queued when
   removal cannot be confirmed. Restore the test configuration immediately.

### Responsive checks

At **375 px**, **768 px**, and **1440 px** viewport widths, verify no essential
control is clipped or unreachable on login, home, journal center, today and
future editors, countdown, opening, reader, comments, calendar, mood, memories,
and settings. Record each width/area result in the matrix.

## 5. Vercel release and rollback

After all gates pass and explicit approval is received:

1. Import the approved commit into Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `NEXT_PUBLIC_RELATIONSHIP_START_DATE`, and the server-only
   `SUPABASE_SERVICE_ROLE_KEY` for the required Vercel environments.
3. Do **not** set `SUPABASE_SECRET_KEY`, user IDs, account passwords, or any
   `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_SECRET_KEY`
   variable in Vercel.
4. Deploy, repeat the production smoke and privacy matrix checks, and preserve
   their evidence with the release.

If a deployment regresses, redeploy the previous verified commit. If a
migration must be reversed, restore the pre-migration backup/snapshot; do not
attempt an ad-hoc destructive rollback against production.
