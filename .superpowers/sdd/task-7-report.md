# Task 7 Report — Private diary interactions

## Status

Complete. Today diaries and explicitly opened future diaries now share private,
space-scoped comments, body annotations, and annotation replies. Unopened future
diaries remain non-interactive for both author and recipient.

## Delivered

- Added shared interaction rules with `Intl.Segmenter` grapheme validation.
- Added chronological, single-level comments with a four-hour author-only
  edit/delete window.
- Added stable `body`-block annotations with code-point offsets, stored quotes,
  replies, safe React text rendering, cross-block rejection, Escape dismissal,
  and pointer/keyboard selection handling without suppressing native selection.
- Added `journal_comments`, `journal_annotations`, and journal
  `annotation_replies`, all with `space_id`, RLS, identity triggers, and narrow
  security-definer mutation RPCs. Raw authenticated mutations are revoked.
- Annotation creation locks and validates the current journal body, block ID,
  offsets, and exact quoted substring in the database.
- Replaced `open_future_diary` in migration 003 so opening and the
  `future_diary_opened` notification happen in one transaction. A unique
  recipient/type/source key for opening notifications plus `ON CONFLICT DO
  NOTHING` makes repeated/concurrent opens idempotent.
- Opening notifications contain only a safe event description and route to the
  opened journal; protected title/body are not copied into notifications.
- Preserved the legacy letter reply feature by renaming its pre-existing table
  to `letter_annotation_replies` before creating the journal reply table and
  updating its callers.
- Left Task 5 storage bucket, upload policies, and cleanup queue behavior intact.

## TDD evidence

- Interaction rules: missing-module RED, then 6 passing tests.
- Migration contracts: 5 expected RED failures, then GREEN; later security
  review regressions for cross-space row binding and caller identity were each
  observed RED before their fixes.
- Server actions: missing-module RED, then 6 passing action tests.
- Comment and annotation UI: missing-component RED, then 3 passing tests.
- Journal reader integration and notification routing were observed failing for
  the new behavior before implementation.

## Verification

- Focused interaction/reader/notification/migration suite: PASS (41 tests at
  the initial combined gate; expanded contracts included in the full suite).
- Full `npm test`: PASS — 30 files, 168 tests.
- `npm run lint`: PASS — no errors or warnings.
- `npm run build`: PASS.
- `git diff --check`: PASS.

## Concerns / follow-up

- No live Supabase database was available, so migration behavior is covered by
  durable SQL contract tests rather than an applied migration integration test.
- Next.js reports the repository's pre-existing multiple-lockfile workspace-root
  warning during build; compilation, type checking, and page generation all
  succeed.
