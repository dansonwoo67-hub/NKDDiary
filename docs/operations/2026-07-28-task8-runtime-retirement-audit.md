# Task 8 runtime retirement audit

## Letter deletion lifecycle

Runtime scope checked: `src/` and `scripts/`.

| Object | UI entry | Frontend/server-action call | Runtime query dependency |
| --- | ---: | ---: | ---: |
| `delete_letter_diary` | 0 | 0 | 0 |
| `purge_letter_diary` | 0 | 0 | 0 |
| `empty_letter_recycle_bin` | 0 | 0 | 0 |
| `auto_purge_letter_deletions` | 0 | 0 | 0 |
| `letter_deletions` | 0 | 0 | 0 |

References that remain are intentionally non-runtime:

- historical migrations that originally introduced the lifecycle;
- the final retirement migration that drops the objects;
- migration contract tests;
- preflight/postflight audit SQL and implementation records.

`journal_entries.deleted_at` and `purge_at` remain as historical compatibility
columns, as required by the approved migration scope. Active code does not call
the retired deletion RPCs or query `letter_deletions`.

## Exceptional states

| State | Current behavior |
| --- | --- |
| Notification missing/inaccessible | Friendly message; no navigation and no optimistic-read residue |
| Letter genuinely missing/inaccessible | RLS-safe not-found response |
| Withdrawn recipient letter | Narrow status RPC; no body access; withdrawal notice instead of 404 |
| Withdrawn author letter | Detail route suppresses the body and shows the withdrawal notice |
| Mark-read failure/zero-row update | Red dot and unread count roll back; navigation is cancelled |

## Remaining non-blocking risks

- Nine raw `<img>` usages remain. They accept signed or user-provided dynamic
  URLs; moving them to the Next.js optimizer requires an explicit remote-host
  policy and should not be hidden behind lint suppressions.
- Historical migrations and superseded design documents still mention the old
  deletion lifecycle. They are audit history, not executable runtime
  dependencies.
- A few self-contained components are not mounted by current routes. They were
  left intact where deletion would also remove tests or plausible near-term
  product surfaces; no runtime bundle imports them.
