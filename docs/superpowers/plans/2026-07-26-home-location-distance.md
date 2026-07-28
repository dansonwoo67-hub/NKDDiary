# Home Location Distance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the opt-in two-account location-distance flow on the homepage without continuous tracking or exposing exact coordinates.

**Architecture:** Keep coordinates in the existing `profiles.last_login_*` fields and calculate distance server-side with the existing Haversine helper. Add a focused client component that explains privacy before requesting browser geolocation, calls the existing server action, stores only a local “permission previously declined” hint, and refreshes the server-rendered homepage after a successful update.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase, Vitest, Testing Library, Tailwind CSS.

## Global Constraints

- Never request browser location automatically; require an explicit click after a privacy explanation.
- Never display exact latitude, longitude, city, or map data to the partner.
- Never track location continuously or in the background.
- Coordinates never expire; always show the last update time when available.
- After a denial, do not automatically prompt again; retain a manual enable/update button.
- When only one partner has a location, clearly show that the feature is enabled for one side and waiting for the other.

---

### Task 1: Coordinate validation and profile timestamp data

**Files:**
- Modify: `src/features/distance/distance.ts`
- Modify: `src/features/distance/distance.test.ts`
- Modify: `src/features/profile/actions.ts`
- Modify: `src/features/profile/repository.ts`
- Modify: `src/features/profile/repository.test.ts`

**Interfaces:**
- Produces: `isValidCoordinates(value: Coordinates): boolean`
- Produces: `SpaceProfile.last_login_at?: string | null`

- [ ] Write failing tests for latitude/longitude bounds and the profile query field list.
- [ ] Run the focused tests and verify they fail for the missing validation/timestamp field.
- [ ] Add coordinate validation and use it in `recordLoginLocationAction`.
- [ ] Include `last_login_at` in active-space profile reads.
- [ ] Run the focused tests and verify they pass.

### Task 2: Location status presentation and browser permission flow

**Files:**
- Create: `src/features/distance/components/LocationDistancePanel.tsx`
- Create: `src/features/distance/components/LocationDistancePanel.test.tsx`

**Interfaces:**
- Consumes: `recordLoginLocationAction({ latitude, longitude })`
- Props: `distanceKm`, `currentUpdatedAt`, `otherUpdatedAt`, `currentHasLocation`, `otherHasLocation`

- [ ] Write failing component tests for the privacy explanation, one-sided waiting state, successful distance state, denial handling, and unsupported-browser handling.
- [ ] Run the component test and verify failures are caused by the missing component.
- [ ] Implement explicit-click geolocation with timeout, denial/error copy, local denial memory, server action call, and `router.refresh()` after success.
- [ ] Run the component tests and verify they pass.

### Task 3: Homepage integration

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/features/home/components/HomeHero.tsx`

**Interfaces:**
- Homepage reads both partners from `profiles.last_login_*` symmetrically.
- `HomeHero` retains relationship-day and avatar visuals; distance controls render in `LocationDistancePanel` immediately below it.

- [ ] Remove the asymmetric fallback that reads the current user’s location from the latest letter.
- [ ] Pass both profiles’ location presence and timestamps into `LocationDistancePanel`.
- [ ] Keep the server-calculated Haversine distance and relationship-day hero.
- [ ] Verify the homepage renders clear states for neither, one, or both profiles having coordinates.

### Task 4: Verification and handoff

**Files:**
- Modify only if required by verification failures.

- [ ] Run focused distance, profile repository, and location panel tests.
- [ ] Run the complete unit test suite.
- [ ] Run lint.
- [ ] Run production build.
- [ ] Package the modified source without `.env.local`, `.next`, or `node_modules`.
