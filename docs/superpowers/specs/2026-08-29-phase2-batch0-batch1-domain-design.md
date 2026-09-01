# NKDDiary Phase 2 Batch 0 + Batch 1 Design

## Scope

This design covers only performance-baseline evidence and foundational domain contracts. It does not change current UI, production data, RLS, RPCs, notification badge rules, or deployed behavior.

## Memory

The Phase 2 product concept `Memory` unifies records sourced from `mood_entries` and `memory_entries` at the TypeScript boundary. `sourceType` is `legacy_mood`, `legacy_memory`, or `memory_v2`. Legacy titles remain available as `legacyTitle`; new memories may omit it. Calendar events remain only in the existing timeline compatibility layer and are not Memory domain records.

## Letter threads

Letters are classified explicitly from `journal_entries`: ordinary is `today` with a recipient, capsule is `future` with a recipient, and `today` without a recipient is legacy and excluded from threads. Withdrawn is an orthogonal state. Historical records form one-letter threads unless explicit thread metadata exists; no heuristic grouping is allowed.

Future persistence uses separate nullable `thread_id` and `reply_to_id`: `thread_id` identifies the conversation group and `reply_to_id` identifies the direct parent. The in-memory contract supports capsule origins, pagination, unread state, and withdrawn history without implementing reply UI.

## Relationship dates

All new business-date APIs use `Asia/Taipei`, the product timezone. Timestamps remain standard instants. The domain exposes today, conversion to `YYYY-MM-DD`, date/date-time formatting, and date comparison. Existing `Asia/Shanghai` call sites are not mass-rewritten in this batch.

## Notification targets

Notification navigation is represented by a discriminated target contract supporting memory, memory comment/reply anchors, letter threads, calendar events/dates, and relationship settings. `isRead` records whether the notification was read; it never removes navigation. `isActive` controls whether the notification remains actionable/visible under current policy. Badge queries remain `recipient_id=currentUser AND is_read=false AND is_active=true`.

## Database

No migration is created or executed. A proposal documents future additive nullable columns and indexes, historical compatibility, RLS impact, rollback, and migration risk. Production is not accessed.

## Verification

Each new domain utility is developed with failing unit tests first. Final verification runs unit/integration tests, lint, `tsc --noEmit`, production build, and the existing Playwright E2E suite. No Production deployment is performed.
