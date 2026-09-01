# Phase 2 Batch 3.1 E2E Stability Investigation

## Scope and safety

- Investigation target: isolated Test Supabase project `dhznooibxcnpioqwnicy`.
- Production Write Guard output during the full run: `Production: false`.
- Production was not queried or modified.
- No product code, database schema, RLS policy, RPC, migration, or business rule was changed.

## Root cause

The failures came from the E2E observation contract, combined with legitimate Test-environment latency variance.

1. Capsule creation feedback used Playwright's default 5-second assertion timeout. The component intentionally waits about 850 ms before starting the Server Action. Test Supabase calls, Server Action completion, RSC regeneration, and read-path propagation can then exceed the remaining window.
2. Comment and reply assertions used an unscoped `getByText(body)`. The locator could be satisfied by the submission area while the same body was still being edited or submitted, before the persisted `comment-*` card existed.
3. The reply flow reloaded immediately after that false-positive assertion. Depending on latency, reload could race the in-flight Server Action. This explains why a reply was sometimes optimistically observed but absent after refresh.

No evidence showed a Batch 3 data-correctness regression. When the test waited for a real persisted comment card, the database row and refreshed read path agreed.

## Timing evidence

Observed on repeated Desktop and Tablet isolated runs plus one full three-project run:

| Boundary | Observed range / maximum |
| --- | --- |
| Click to capsule action request | about 0.89-0.95 s, matching existing animation delay |
| Capsule action response observed | about 1.9-3.5 s |
| Capsule row visible through independent DB read | up to 5.392 s |
| Full capsule POST | up to 7.4 s |
| Comment card visible | up to 7.583 s |
| Comment row visible through independent DB read | up to 7.414 s |
| Journal detail refresh/read path | about 2.2-4.1 s in instrumented runs; server logs also showed higher route variance |

Before the selector fix, the reply text assertion returned in about 52 ms while its database row became readable about 1.4 s later. That ordering proved the assertion was not observing the persisted reply card.

## Layer assessment

- Database write latency: variable but commits completed successfully; not the sole cause.
- Supabase/network latency: material variance in Test environment.
- Server Action completion: material; actions and subsequent RSC work can exceed 5 seconds.
- `router.refresh()` / cache invalidation: contributes to complete POST/read-path duration; no stale-data defect reproduced after confirmed persistence.
- React/UI propagation: correct after Server Action result; no product-state regression found.
- Playwright waiting strategy: primary defect. Default timeout and ambiguous locator did not represent the persistence contract.
- Shared fixture contention: excluded. Playwright uses one worker, capsule suite is serial, and cleanup is marker-scoped.
- Cross-test quota contamination: excluded. Each run removed dedicated-account `e2e_` rows before setup and after teardown; same-day postflight count was zero.
- Storage/comment residue: excluded by postflight counts.

## Minimal fix

- Kept business assertions unchanged.
- Scoped comment/reply waits to the nearest real `div[id^="comment-"]` card.
- Added independent service-role read confirmation for created capsule rows and comments.
- Verified reply `parent_id` points to the persisted top-level comment.
- Verified quota rejection leaves exactly one same-day capsule row.
- Replaced the implicit 5-second write-feedback bound with a test-local 30-second operation bound justified by measured latency. Global Playwright timeout was not changed.
- Added action/read-path timing output. No `waitForTimeout` or arbitrary sleep was added.

## Fixture isolation

- `fullyParallel: false`
- `workers: 1`
- capsule lifecycle: serial
- dedicated Susan/Niki synthetic accounts
- marker-scoped database and Storage cleanup
- cleanup order: notifications, comments, Storage objects, journal entries
- postflight expected residue: zero journal rows, comments, entry notifications, and Storage objects with E2E markers

## Verification record

- Narrow Desktop capsule suite: 4/4 passed after fix.
- Narrow Tablet capsule suite: 4/4 passed after fix.
- Full E2E: 21/21 passed across Mobile, Tablet, and Desktop.

