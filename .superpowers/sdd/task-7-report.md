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
  and a two-phase pointer/keyboard selection state machine without suppressing
  intermediate native selection.
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
  observed RED before their fixes. A second review added RED contracts for
  cross-space direct legacy-notification calls, normalized database length
  enforcement, and active-space-only calendar recipients before those fixes.
- Server actions: missing-module RED, then 6 passing action tests.
- Comment and annotation UI: missing-component RED, then passing component
  tests; the second review added six observed RED selection-state regressions
  covering intermediate selection, final commits, touch, focus, and keyboard.
- Journal reader integration and notification routing were observed failing for
  the new behavior before implementation.
- A third review produced RED tests for the missing server-only service client,
  explicit actor authorization, the 200-heart exact boundary, calendar
  self-recipient behavior, and Escape cleanup before implementation.

## Verification

- Focused third-review service/action/component/migration suite: PASS — 4 files,
  45 tests.
- Full `npm test`: PASS — 31 files, 187 tests.
- `npm run lint`: PASS — no errors or warnings.
- `npm run build`: PASS.
- `git diff --check`: PASS.

## Concerns / follow-up

- No live Supabase database was available, so migration behavior is covered by
  durable SQL contract tests rather than an applied migration integration test.
- Deployments must provide `SUPABASE_SERVICE_ROLE_KEY` as a server-only secret;
  missing configuration safely disables comment creation and updates.
- Next.js reports the repository's pre-existing multiple-lockfile workspace-root
  warning during build; compilation, type checking, and page generation all
  succeed.

## Independent review remediation

Follow-up hardening completed after three Task 7 reviews:

- Removed the legacy authenticated notification INSERT policy and table grant
  before introducing the future-open enum value. Existing annotation, reply,
  letter-open, and calendar notifications now call one security-definer RPC
  that derives recipient, type, source, title, and body from validated database
  rows; callers cannot provide notification content or recipient IDs.
- Added a database-owned `future_diary_opened` discriminator whose CHECK
  constraint is equivalent to the notification enum type. The partial unique
  index is now strictly `(recipient_id, type, source_id)` for that type and no
  longer depends on title text. The open RPC always sets the discriminator.
- Tightened the legacy notification RPC to resolve exactly one active space for
  the caller and every legacy source actor. It rejects mismatched/non-unique
  source and recipient membership, and calendar recipients now come only from
  active `space_members` in that caller space rather than all profiles. Calendar
  reminders intentionally include the caller as well as their partner.
- Comment create/update RPC execution is revoked from authenticated clients and
  granted only to `service_role`. A dedicated server-only Supabase client is
  used exclusively after `requireUser` and exact `Intl.Segmenter` validation;
  it passes that authenticated user as `p_actor_id` and is never used for reads
  or other ordinary mutations.
- Comment RPCs no longer infer the terminal user from `auth.uid()`. Membership,
  journal eligibility, authorship, the four-hour window, row locks, and
  comment/journal identity binding all use the explicit actor. The database now
  keeps only an NFC-normalized 20,000-code-point storage/DoS ceiling, allowing
  valid inputs such as 200 `❤️` graphemes while the server action rejects 201.
- `selectionchange` now only records a candidate ref. Document `pointerup` and
  `keyup` perform the final commit; touch waits for a quiet period and exposes a
  non-focus-stealing “添加评注” button. A readonly accessible textarea provides
  a real keyboard selection range, and closing the dialog restores focus to the
  originating body control. Both cross-block directions and external
  selections remain covered.
- Closing or pressing Escape also clears a pending touch candidate, restores
  focus once, and clears the saved focus target to prevent later focus jumps.
