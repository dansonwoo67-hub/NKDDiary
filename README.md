# NKD Diary

NKD Diary is a private two-person diary application. It has no public sign-up
flow. Every application route requires an authenticated member of the single
active couple space.

The release procedure and manual security evidence live in:

- [Deployment checklist](docs/operations/deployment-checklist.md)
- [Privacy test matrix](docs/operations/privacy-test-matrix.md)

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create your local environment file without committing it:

   ```powershell
   Copy-Item .env.local.example .env.local
   ```

3. Fill in `.env.local` from a Supabase project. See the variable-by-variable
   notes in the deployment checklist. The browser uses
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY` are secrets: never
   rename either with a `NEXT_PUBLIC_` prefix, commit them, or expose them to
   browser code.

4. Apply the migrations in the exact order listed in the deployment checklist.
   Verify that `journal-images` is private before continuing.

5. Create two Auth users in Supabase. Record their UUIDs and display names for
   the seed script; record their email/password only when you will run local
   two-user E2E. Then seed the one active couple space:

   ```powershell
   npm run seed:couple-users
   ```

6. Start the development server:

   ```powershell
   npm run dev
   ```

## Release gate

Run the complete gate from the repository root:

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
git status --short
```

`npm run test:e2e` deliberately exits non-zero when the real Supabase
integration variables or seeded accounts are unavailable; it does not convert
missing privacy evidence into a pass. Complete the manual matrix, storage
checks, and responsive checks before requesting production deployment.

## Vercel

Configure only the runtime variables documented in the deployment checklist.
The two account credentials are local E2E fixture credentials, while
`SUPABASE_SECRET_KEY` is a local seeding secret; neither belongs in Vercel.
`SUPABASE_SERVICE_ROLE_KEY` is a server-only Vercel secret required by the
comment create/update path and is also a local E2E prerequisite.

Do not apply production migrations or deploy until explicit approval has been
given. If a release must be rolled back, redeploy the previous verified commit;
if a migration must be reversed, restore the pre-migration Supabase backup.
