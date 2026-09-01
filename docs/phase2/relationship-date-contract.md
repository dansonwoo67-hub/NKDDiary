# Relationship Date Contract

## Rule

All new business-date interpretation uses IANA timezone `Asia/Taipei` (UTC+8). Database `timestamptz` values remain instants and are not rewritten.

## API

- `toRelationshipDate(value)` converts an instant to `YYYY-MM-DD` in UTC+8 and preserves an existing date-only string.
- `getTodayInRelationshipTimezone(now?)` returns the current business date.
- `formatRelationshipDate(value)` formats a calendar date.
- `formatRelationshipDateTime(value)` formats an instant in UTC+8.
- `compareRelationshipDates(left, right)` compares normalized calendar dates.

## Compatibility

Existing `Asia/Shanghai` helpers currently produce the same UTC+8 calendar result. Batch 1 does not mass-edit call sites merely to align timezone strings. Later batches should adopt the new API flow by flow with regression tests.

## Tested boundaries

UTC+8 00:01 and 23:59, month rollover, year rollover, formatting and comparison are covered by unit tests.
