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
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side comment create/update actions and local two-user E2E cleanup/setup | Required in Vercel as a server secret and locally for `npm run test:e2e`; never use a `NEXT_PUBLIC_` name. |
| `SUPABASE_SECRET_KEY` | Local `npm run seed:couple-users` only | Required locally for Auth admin calls; never configure in Vercel or browser code. |
| `COUPLE_USER_A_ID`, `COUPLE_USER_B_ID` | Local seed script | UUIDs of two distinct, already-created Supabase Auth users. |
| `COUPLE_USER_A_DISPLAY_NAME`, `COUPLE_USER_B_DISPLAY_NAME` | Local seed script | Required display names. |
| `COUPLE_USER_A_EMAIL`, `COUPLE_USER_B_EMAIL` | Local two-user E2E | Required login emails for `npm run test:e2e`; not read by the seed script and never configured in Vercel. |
| `COUPLE_USER_A_PASSWORD`, `COUPLE_USER_B_PASSWORD` | Local two-user E2E | Required login passwords for `npm run test:e2e`; not read by the seed script and never configured in Vercel. |
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

The full local E2E runner requires exactly these seven populated values:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `COUPLE_USER_A_EMAIL`,
`COUPLE_USER_A_PASSWORD`, `COUPLE_USER_B_EMAIL`, and
`COUPLE_USER_B_PASSWORD`. The UUID/display-name values and
`SUPABASE_SECRET_KEY` are additionally required only when reseeding.

## 2. Database and Storage preparation

Take a recoverable Supabase backup/snapshot before applying any migration. Do
not proceed until the release record identifies the **target** Supabase project
reference, project URL, and intended environment (for example, disposable test
or production), and the operator has confirmed they match the approved target.
Record the backup/snapshot identifier, creation time, and owner. In the
Supabase SQL editor or the team's approved migration mechanism, apply these
files in this exact lexicographic order and stop on the first error:

```text
supabase/migrations/202607100001_initial_schema.sql
supabase/migrations/202607100002_harden_security_and_indexes.sql
supabase/migrations/202607190001_rebuild_core.sql
supabase/migrations/202607190002_journal_functions.sql
supabase/migrations/202607190003_interactions_and_storage.sql
supabase/migrations/202607190004_product_integration.sql
```

Apply one file at a time. For each, append the filename, SHA-256 from
`Get-FileHash <file> -Algorithm SHA256`, target project reference, SQL editor
job/query identifier (or approved-tool run identifier), UTC completion time,
operator, and result to the release record before starting the next file. Do
not mark a file applied based solely on a local working-tree filename.

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
4. Use this repeatable **duplicate-today quota conflict** in a dedicated
   non-production project: create a valid **today** diary for the author and
   Shanghai date without an image. Then, from the normal editor, submit a
   second otherwise-valid today diary for the same author/date with a valid
   compressed image. This deliberately makes the Storage upload succeed first
   and causes the subsequent `create_today_diary` RPC to fail on the
   one-today-diary quota; it is not a client/schema pre-validation failure.
   Capture the resulting object key from the Storage log/dashboard, then verify
   it is removed by the cleanup retries or that
   `journal_image_cleanup_jobs` contains the matching `database_write_failed`
   job. Preserve the RPC error and cleanup evidence, and remove only the
   dedicated test data after recording the outcome.

### Responsive checks

At **375 px**, **768 px**, and **1440 px** viewport widths, verify no essential
control is clipped or unreachable on login, home, journal center, today and
future editors, countdown, opening, reader, comments, calendar, mood, memories,
and settings. Record each width/area result in the matrix.

## 5. Vercel release and rollback

After all gates pass and explicit approval is received, complete the release
record before changing any remote system: approved Git commit SHA, intended
Vercel environment and project, intended Supabase project reference/URL,
pre-migration backup identifier, previous verified Vercel deployment URL/ID,
and previous verified Git commit SHA. Stop if any target differs from the
approved record.

1. Import/deploy the approved commit SHA to the recorded Vercel project and
   environment; record the resulting deployment URL/ID and UTC time.
2. Set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `NEXT_PUBLIC_RELATIONSHIP_START_DATE`, and the server-only
   `SUPABASE_SERVICE_ROLE_KEY` for the required Vercel environments.
3. Do **not** set `SUPABASE_SECRET_KEY`, user IDs, account passwords, or any
   `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_SECRET_KEY`
   variable in Vercel.
4. Repeat the production smoke and privacy matrix checks, record the deployed
   commit SHA shown by the application/deployment, and preserve their evidence
   with the release.

If a deployment regresses, redeploy the recorded previous verified deployment
or commit and record the new rollback deployment ID/UTC time. If a migration
must be reversed, restore the recorded pre-migration backup/snapshot to the
confirmed target according to the provider's recovery procedure; do not attempt
an ad-hoc destructive rollback. After either rollback, re-confirm the target
project/environment, deployed commit, login smoke, private bucket status, and
the affected privacy-matrix rows before declaring recovery successful.
