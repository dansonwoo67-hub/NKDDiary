# Task 9 verification report

## Scope

- Replaced the legacy letter E2E coverage with an unauthenticated login smoke test and a rebuilt diary lifecycle suite.
- Added a serial, per-project two-browser-context integration journey. It uses a process-unique marker and only service-role cleans journal rows/images whose title starts with that marker and whose author is one of the two authenticated fixture accounts.
- Added runner preflight that safely reads `.env.local` without printing values. Missing integration prerequisites run smoke only and make `npm run test:e2e` fail explicitly; they are never reported as privacy/quota evidence.

## TDD evidence

1. RED: `npm test -- scripts/playwright-e2e-config.test.ts` initially failed because the new helper import was absent. A minimal callable skeleton then produced the intended two assertion failures: parser returned `{}` and missing-prerequisite detection returned `[]`.
2. GREEN: after implementing the parser, `.env.local` loader, and required-variable detection, `npm test -- scripts/playwright-e2e-config.test.ts` passed: 1 file, 2 tests.

## Commands and results

| Command | Result |
| --- | --- |
| `npm test -- scripts/playwright-e2e-config.test.ts` | PASS — 1 file, 2 tests. |
| `npx playwright test --list` | PASS — discovered the smoke test and three lifecycle tests in both Chromium and Pixel 7 projects. |
| `npm test` | PASS — 39 files, 209 tests. |
| `npm run lint` | PASS. |
| `npm run build` | PASS. Next warned that the parent worktree lockfile was inferred as workspace root. |
| `git diff --check` | PASS. |
| `npm run test:e2e` | Smoke PASS — Chromium and mobile each passed the unauthenticated login/registration check. Full integration gate intentionally exited nonzero after smoke because required fixture environment is missing. |

## Integration availability blocker

The worktree has no `.env.local`, and the process has none of these required variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `COUPLE_USER_A_EMAIL`, `COUPLE_USER_A_PASSWORD`, `COUPLE_USER_B_EMAIL`, `COUPLE_USER_B_PASSWORD`.

Consequently, the real two-user lifecycle did **not** execute and is not counted as passing privacy, quota, image, direct-API, or interaction evidence. Supplying a real migrated Supabase project, two seeded accounts, and the listed variables will run the full journey on both projects. `E2E_IMAGE_PATH` is optional; when supplied with a valid image fixture, the future-diary journey uploads it and verifies it becomes visible only after explicit opening.

## Review-fix addendum

The lifecycle harness was strengthened after independent review:

- Keyboard annotation now expands the keyboard-selection summary, focuses the textarea, dispatches selection plus keyup, checks the dialog quote, and verifies persisted `start_offset`, `end_offset`, quoted text, annotation, and reply.
- Author and recipient contexts inherit the active project device context. Mobile additionally asserts viewport, touch points, and mobile user agent.
- Privacy is asserted both before readiness and again after the open button appears but before confirmation, including UI, direct route, recipient REST, and metadata RPC surfaces.
- Sealed-author reread and UI/raw mutation rejection are asserted before recipient opening; service-role comparison proves title, content, and opening time remain unchanged.
- Cleanup is constrained to the two authenticated test identities and all historical `[e2e-task9-` rows returned by the service query. Same-day non-Task-9 fixture rows abort the journey as contaminated.
- Shanghai date is captured once and rechecked after creation. The open schedule is rounded to a safe future minute and the wait timeout has interaction headroom.
- The runner now allocates an empty local port, validates the actual 200 login page body, watches child startup failure, and waits for child shutdown.

### Additional TDD and verification

1. RED: added runner helper tests for project context filtering and strict login readiness. `npm test -- scripts/playwright-e2e-config.test.ts` failed with the expected missing-function `TypeError`s.
2. GREEN: implemented those helpers; the focused suite passed 1 file, 4 tests.
3. `npm run test:e2e` smoke passed on Chromium and mobile using a newly allocated port. It then exited nonzero as designed because the seven required integration variables are unavailable. No image evidence was executed because neither integration credentials nor `E2E_IMAGE_PATH` are present.
4. `npm test` passed 39 files, 211 tests; `npm run lint`, `npm run build`, and `git diff --check` passed. The existing multi-lockfile workspace-root warning is non-fatal.
