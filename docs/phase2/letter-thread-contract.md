# Letter Thread Contract

## Letter classification

- ordinary: `entry_type='today' AND recipient_id IS NOT NULL`
- capsule: `entry_type='future' AND recipient_id IS NOT NULL`
- legacy: `entry_type='today' AND recipient_id IS NULL`; excluded from current letter threads and never reinterpreted as a personal diary product
- withdrawn: orthogonal state from `withdrawn_at IS NOT NULL`

## Thread identity

Historical rows without explicit `thread_id` each form an independent thread using their own letter ID. The adapter never groups by participants, title, date, proximity, content, or any other heuristic.

Future persistence roles are distinct:

- `thread_id`: stable identity for the entire exchange.
- `reply_to_id`: direct letter being replied to.

`reply_to_id` is not recursively treated as a substitute for stored `thread_id`.

## Contract

`LetterThread` contains thread ID, participants, first/latest letter IDs, total count, latest activity, unread state, origin type, letters and pagination state. Withdrawn letters remain in sender-visible history. Unread is true only for an active, unopened letter addressed to the viewer.

## Capsule replies

An unopened capsule cannot be replied to. After explicit open it may seed a thread, but the reply itself is an ordinary letter. This batch models the origin and reply relationship only; it adds no composer or withdraw UI.
