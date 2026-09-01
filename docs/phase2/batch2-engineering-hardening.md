# NKDDiary Phase 2 — Batch 2 Engineering Hardening

## Outcome

Batch 2 closes the two conditions from the Batch 0 + Batch 1 gate review:

- TypeScript typechecking is green.
- Write-capable E2E is fail-closed and targets only the independent Supabase test project.

No product behavior, production schema, production data, migration SQL, RLS, or RPC definition was changed.

## Test environment

- Environment: `E2E Test`
- Supabase project ref: `dhznooibxcnpioqwnicy`
- Isolation: independent empty project, not Production
- Initial schema: NKDDiary v1.0.0 baseline loaded directly for test setup; it is not a product migration
- Dedicated fixtures: two synthetic E2E accounts and one isolated couple space
- Post-run fixture residue: zero journal entries, zero comments, zero Storage objects matching the E2E marker

## Production write guard

The runner and Playwright global setup both enforce a fail-closed guard before any browser or database write:

- the explicit write-test flag must be enabled;
- the target URL must contain a valid Supabase project ref;
- the ref must equal the approved E2E allowlist ref;
- the ref must not equal the derived Production ref;
- a server-only service-role credential must be present;
- contradictory allow/deny configuration is rejected.

The guard returns only non-secret environment metadata. Production credentials are never logged.

## E2E coverage

The write-capable suite exercises three release viewports and covers:

- login and absence of public registration;
- all five signed-in product areas and horizontal overflow checks;
- dedicated Susan/Niki two-account capsule-letter lifecycle;
- daily capsule quota;
- sealed capsule immutability;
- recipient metadata gating and explicit opening;
- read state, comments, and replies;
- real `journal-images` Storage upload, download, and marker-scoped cleanup.

## Verification evidence

- `npm test`: 82 files passed, 356 tests passed.
- `npx tsc --noEmit`: passed with zero errors.
- `npm run lint`: zero errors, nine existing `no-img-element` warnings.
- `npm run build`: passed; Next.js production build completed successfully.
- `npm run test:e2e`: 21 tests passed in 9.1 minutes.

## Residual risks

- The isolated Supabase project showed cold-start latency, including some multi-minute lifecycle waits. The suite therefore uses test-only timeout headroom; no product behavior was changed.
- Nine existing image optimization warnings remain and are outside Batch 2 scope.
- The test project intentionally remains available for future non-Production E2E runs.

## Batch 3 candidates

- Batch 0 performance baseline items: signed-URL N+1, serial notification queries, broad refresh/reload after mutations, and repeated membership/profile reads.
- Test-environment lifecycle automation, while preserving the same fail-closed Production guard.
- Existing image optimization warnings.
