# Phase 2 Domain Model

## Boundaries

Phase 2 establishes TypeScript contracts without changing current UI or persistence. Database table names are storage history, not product vocabulary.

## Memory

`UnifiedMemory` represents product memories sourced from `mood_entries` or `memory_entries`. `calendar_events` may remain in the old timeline aggregation only as **timeline compatibility** and is not a Memory product record.

## Letter and thread

`journal_entries` maps to ordinary, capsule, or legacy records using the explicit whitelist. Withdrawn is state, not a separate content type. A `LetterThread` is a group only when an explicit thread identifier exists; otherwise one letter equals one thread.

## Relationship date

Business calendar interpretation uses `Asia/Taipei`. Instants remain timestamps; `YYYY-MM-DD` values remain calendar dates and are never reparsed through the host timezone.

## Notification target

Notification read state, active state and navigation target are separate concerns. Read active notifications remain navigable. Badge semantics are unchanged.

## Dependency direction

Database rows → adapter → pure domain contract → future UI. Pages must not reproduce schema compatibility branches once they adopt these contracts.
