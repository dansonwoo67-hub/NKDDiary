# Batch 0 Performance Baseline

Date: 2026-08-29  
Method: read-only static request and render-flow audit. Counts below are lower-bound operations visible in source, not browser network timings. No optimization was implemented.

## Scenario baseline

| Scenario | Current request/re-render shape | Evidence |
| --- | --- | --- |
| Home first entry / refresh | `requireUser` loads auth, membership and profile; page then starts five branches. Calendar adds five parallel table reads, profile repository two reads, memories four reads plus one signed-URL request per pictured memory, then spaces and location history. Lower bound is 16 database/auth operations plus N signed URLs. | `src/app/(app)/page.tsx:21-33`; `src/lib/auth/require-user.ts:50-78`; `src/features/calendar/actions.ts:81-88`; `src/features/profile/repository.ts:16-21`; `src/features/memories/repository.ts:110-142` |
| Home → letters | Server render loads user, two profile queries, two letter queries, comment rows, draft and unread notifications. Several top-level groups are parallel, but partner lookup completes before boxes/draft/unread start. | `src/app/(app)/journal/page.tsx:10-20`; `src/features/journal/letter-repository.ts:61-123` |
| Open letter | Params/auth/client start together; detail may additionally load comments and mark read, followed by path revalidation/client refresh. | `src/app/(app)/journal/[id]/page.tsx:25-46`; `src/features/journal/letter-actions.ts:74-80`; `src/features/journal/components/LetterReaderV1.tsx:95-96` |
| Return to list | Navigation causes the full Journal Server Component data chain to run again; no documented shared request cache exists at the domain boundary. | `src/features/journal/components/JournalPageClient.tsx:259`; `src/app/(app)/journal/page.tsx:10-20` |
| Home → memories | Four reads run in parallel, followed by a second phase of N individual Storage signed URL calls. Timeline then has multiple client effects. | `src/features/memories/repository.ts:110-142`; `src/features/memories/components/MemoryTimeline.tsx:80-104` |
| Open notification | Bell loads list and unread state in parallel. Center data then performs partner lookup before notification query, followed by actor, journal and calendar enrichment stages. Click performs optimistic state, server mutation, navigation, then `router.refresh()`. | `src/features/notifications/components/NotificationBell.tsx:8-11`; `src/features/notifications/actions.ts:100-170`; `src/features/notifications/components/NotificationCenterClient.tsx:158-188` |
| Create current memory | Optional upload, create RPC, then revalidates `/` and `/memories`; both server trees reload when next visited/rendered. | `src/features/memories/actions.ts:24-69` |
| Open calendar | Calendar action uses five parallel reads after a separate `requireUser` chain. | `src/features/calendar/actions.ts:81-88` |
| Susan/Niki switch | Account-scoped draft keys are correct, but switching and mutation paths use `router.refresh()` or `window.location.reload()`, forcing broad data reloads. | `src/features/journal/components/JournalPageClient.tsx:65-114,174-204,272-292,458-459` |

## Current bottlenecks

### P0

No data-consistency or runtime blocker was identified in this static performance audit. P0 remains reserved for measured failures that prevent core flows.

### P1

1. **Signed URL N+1** — `src/features/memories/repository.ts:134-142`
   - Current behavior: after four feed queries complete, every pictured memory calls `createSignedUrl` separately.
   - Cost: adds a second network phase whose latency and request count scale with feed images; affects home and memories.
   - Phase 2: yes; measure and batch/cache in Batch 2.

2. **Notification multi-stage waterfall** — `src/features/notifications/actions.ts:100-170`
   - Current behavior: partner profile lookup completes before notification fetch; actor enrichment then journal/calendar enrichment follows.
   - Cost: multiple dependent round trips before the center is usable.
   - Phase 2: yes; restructure query phases in Batch 2 without changing read semantics.

3. **Broad post-mutation refresh/reload** — `src/features/notifications/components/NotificationCenterClient.tsx:188`; `src/features/journal/components/JournalPageClient.tsx:275-292,459`; `src/features/settings/SettingsPageClient.tsx:127`
   - Current behavior: actions refresh server trees; some draft/settings paths reload the document.
   - Cost: discards client state, repeats auth/data queries, and creates full-page loading perception.
   - Phase 2: yes; replace only after per-flow consistency tests in Batch 2/3.

4. **Repeated membership/profile reads** — `src/lib/auth/require-user.ts:64-75`; `src/features/profile/repository.ts:16-21`; `src/app/(app)/page.tsx:21-33`
   - Current behavior: authentication context loads membership/profile, then page repositories load membership/profile again.
   - Cost: repeated queries on most server navigations and account switches.
   - Phase 2: yes; introduce request-scoped deduplication in Batch 2 after verifying account isolation.

### P2

5. **Letter list split queries and client-wide state** — `src/features/journal/letter-repository.ts:61-145`; `src/features/journal/components/JournalPageClient.tsx:176-204`
   - Current behavior: ordinary and capsule letters are fetched separately, then all comment rows are fetched for client-side counts; a large client component owns several effects.
   - Cost: extra request and growing render surface as thread UI arrives.
   - Phase 2: optimize query contract and component boundaries only when Batch 2 implements threads.

## Existing positive controls

- Home top-level independent work already uses `Promise.all`.
- Calendar table reads are parallel.
- Notification unread count has no 5-item or 30-day limit and remains `is_read=false AND is_active=true`.
- Draft keys include the current user ID, preventing cross-account localStorage reuse.

## Measurement follow-up

Batch 2 should add browser/server instrumentation for request counts, server component duration, LCP, and mutation-to-stable-UI time. This report deliberately does not claim measured milliseconds.
