# Phase 2 Batch 2 Engineering Hardening Design

## Scope

Batch 2 is an engineering-only gate. It makes the existing TypeScript test contracts compile, separates write-capable Playwright journeys from local development and Production, and runs the complete E2E suite against the isolated Supabase project `dhznooibxcnpioqwnicy`. It does not change product behavior, Production schema, migrations, RLS, RPCs, or Production data. Test-project schema is restored from the approved v1.0.0 baseline solely as disposable E2E infrastructure.

## TypeScript green strategy

The initial `npx tsc --noEmit --pretty false` run reports 19 errors in four test-contract groups:

1. `requireUser` mocks omit the required `email` property.
2. journal reader/media fixtures no longer construct the complete `JournalEntry` shape.
3. memory repository fixtures omit author/creator snapshot fields.
4. one route assertion compares against an impossible route literal and four migration tests use the ES2018 dotAll RegExp flag while the repository target remains ES2017.

Fixes remain test-side. Reusable fixture builders will return complete production types; mock values will match the real return contract; impossible comparisons will be expressed as array membership assertions; dotAll expressions will use ES2017-compatible `[\s\S]`. The production interfaces and `tsconfig.json` remain unchanged.

Each group is verified by its focused Vitest suite and a fresh typecheck before moving to the next group.

## E2E environment isolation

Normal development continues to read `.env.local`. The write-capable E2E runner reads only `.env.e2e.local`; it must not fall back to `.env.local`. The real file remains ignored by the existing `.env.*` rule. A committed `.env.e2e.local.example` documents names and purposes with non-secret placeholders only.

The E2E environment requires:

- `E2E_TEST_ENV=true`
- `E2E_ALLOWED_SUPABASE_PROJECT_REF=dhznooibxcnpioqwnicy`
- `PRODUCTION_SUPABASE_PROJECT_REF=<production-ref>`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- two dedicated test-user email/password pairs

The publishable key name follows the application's existing convention. The service-role key remains server/test-process only and is never logged or exposed through a `NEXT_PUBLIC_` name.

## Production write guard

`scripts/e2e-environment-guard.ts` will contain pure parsing and validation functions plus a throwing assertion. The guard extracts the project ref only from a valid `https://<ref>.supabase.co` URL and allows execution only when all required values exist, the explicit test flag is true, the parsed ref equals both the configured allowlist and the fixed Batch 2 project ref, and neither equals the Production denylist.

All failures are fail-closed and throw an error beginning:

`Refusing to run write-capable E2E against production Supabase.`

No secret value appears in the error. Unit tests cover the allowed test project, Production URL rejection, missing test flag, flag-plus-Production rejection, allowlist mismatch, malformed URL, missing service role, and allowlist/denylist conflict.

## Double guard integration

The first guard runs in `scripts/run-playwright-e2e.ts` immediately after loading `.env.e2e.local` and before port allocation or Next.js startup. The second guard runs from Playwright `globalSetup`, so direct `npx playwright test` execution also fails before loading test suites.

Both entry points call the same assertion. The Playwright child and Next.js child receive the already validated E2E environment.

## Dedicated accounts and space

Only the isolated project `dhznooibxcnpioqwnicy` may receive Batch 2 setup writes. Two synthetic addresses represent Susan E2E and Niki E2E. Credentials live only in `.env.e2e.local`. Setup is idempotent: locate or create the two Auth users, assign non-sensitive display metadata, create one dedicated space, and ensure both users have membership. It must not use real email addresses or Production identities.

The existing seed utility may be reused only after the shared guard runs and only if its write scope is made explicit. No schema object is created or altered.

## Test markers and cleanup

Every run generates an `e2e_<timestamp>_<process-id>` marker. All writable content and Storage paths created by the capsule journey include that marker. Cleanup predicates require both dedicated E2E user IDs and the `e2e_` prefix; no date-only or unqualified delete is allowed.

Teardown removes dependent comments and notifications first when they are created, then Storage objects, then journal rows. Memory/mood rows are included only if an existing E2E journey creates them. `afterAll` always attempts cleanup. Cleanup failures remain test failures and report only the marker, never credentials.

## Storage isolation

Storage clients inherit the validated test project URL. Test objects use an `e2e/` or equivalent marker-bearing path in the existing test bucket and are removed during teardown. The guard executes before any Storage client is created.

## Verification gate

Batch 2 completes only when all commands genuinely pass:

- `npm test`
- `npx tsc --noEmit`
- `npm run lint` with zero errors
- `npm run build`
- `npm run test:e2e` against project `dhznooibxcnpioqwnicy`

The final E2E output may print only the safe confirmation: environment type, project ref, and `Production: false`.

## Failure strategy

Environment and guard failures stop before Next.js starts. Fixture, timing, or obsolete test-contract failures may be repaired only in test infrastructure. A failure that requires product-code behavior changes is recorded in `docs/phase2/batch3-backlog.md`, and Batch 2 stops without claiming completion. Cleanup failures preserve the original failure and identify the residual marker.

## Explicit exclusions

This batch does not implement Letter Thread schema/UI, Memory V2 UI, global timezone migration, notification navigation, withdrawal changes, product bug fixes, performance work, schema changes, migrations, RLS/RPC changes, or Production deployment/writes.
