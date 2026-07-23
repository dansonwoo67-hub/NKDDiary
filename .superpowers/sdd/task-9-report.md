# Task 9 verification report

## Scope delivered

- Replaced the legacy letter E2E suite with rebuilt diary routes plus an unauthenticated login-only smoke journey.
- Added a serial two-user lifecycle on both Desktop Chromium and Pixel 7. Each run uses isolated author/recipient browser contexts, project device options, and mobile viewport/touch/user-agent assertions.
- The service-role fixture cleanup is restricted to the two authenticated test IDs. It removes only rows first selected by IDs whose titles use the stable `[e2e-task9-` prefix, plus only their returned image paths. Same-day non-Task-9 rows make the fixture fail as contaminated.
- The lifecycle locks Asia/Shanghai creation date, checks independently enforced today/future quotas, pre-ready and ready-but-unopened privacy on UI/direct route/recipient REST/safe-card APIs, sealed-author reread/immutability, opening, comments, keyboard inline annotations, replies, and optional image visibility when `E2E_IMAGE_PATH` is supplied.
- The E2E runner safely loads `.env.local` without displaying values, chooses an empty local port, verifies a complete 200 NKD login page response, and tracks both Next and Playwright process trees from spawn through bounded graceful/forced shutdown. Unix children run in detached process groups and receive group `SIGTERM` then bounded `SIGKILL`; Windows uses asynchronous bounded `taskkill /T` then bounded `taskkill /T /F`, without command output or unbounded waits.

## TDD evidence

1. Initial helper cycle: RED recorded missing/incorrect environment parser and integration prerequisite behavior; GREEN resulted in the safe loader and prerequisite validation.
2. Review hardening cycle: RED recorded missing project-context and strict-readiness helpers; GREEN added those helpers and mobile context coverage.
3. Final runner-race cycle: RED added tests for signal-aware child state, body-inclusive readiness timeout, and bounded Unix/Windows process-tree termination plans. GREEN added them; focused helper tests pass 8/8.

## Verification commands and results

| Command | Result |
| --- | --- |
| `npm test -- scripts/playwright-e2e-config.test.ts` | PASS — 1 file, 8 tests. |
| `npx playwright test --list` | PASS — discovered smoke plus 3 serial lifecycle tests in Chromium and Pixel 7. |
| `npm test` | PASS — 39 files, 215 tests. |
| `npm run lint` | PASS. |
| `npm run build` | PASS. The existing multi-lockfile workspace-root warning is non-fatal. |
| `git diff --check` | PASS. |
| `npm run test:e2e` | Smoke PASS — Chromium and mobile each passed login/registration smoke using a free local port. The full command then intentionally exited nonzero because integration prerequisites are unavailable. |

## Integration availability blocker

This worktree has no `.env.local`, and the process has none of: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `COUPLE_USER_A_EMAIL`, `COUPLE_USER_A_PASSWORD`, `COUPLE_USER_B_EMAIL`, `COUPLE_USER_B_PASSWORD`.

Therefore the real two-user lifecycle did **not** execute and is not claimed as passing privacy, quota, image, direct-API, or interaction evidence. `E2E_IMAGE_PATH` is also absent, so no image evidence ran. With a real migrated Supabase project, seeded accounts, the listed credentials, and optionally a valid image fixture, the full two-user suite runs on both projects.
