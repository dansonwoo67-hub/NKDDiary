# Couple Diary privacy and acceptance matrix

**Current status:** `NOT RUN` for every live-system row. Static tests can
support these expectations, but they do not prove a deployed Supabase project's
RLS, Storage policies, Auth claims, or Vercel environment. Replace a status
only with observed evidence (date, tester, environment, and result); never
infer `PASS` from source code.

## Test fixtures and evidence

Prepare these before testing:

- **Guest:** an unauthenticated browser context.
- **Author:** active member A, who creates one today diary and one future diary
  addressed to member B, with title, body, and a test image.
- **Recipient:** active member B. Test the future diary both before `open_at`,
  at/after `open_at` but before opening, and after B actively opens it.
- **Non-member:** an authenticated third account with no diary membership claim
  and no active `space_members` row.

Use a disposable non-production project for forced-error and cleanup checks.
For each row, record the URL/entry ID, tester, UTC timestamp, browser, and a
redacted screenshot or request trace in the evidence column.

### Status key

`PASS` = observed expected result. `FAIL` = observed unexpected result (block
release). `NOT RUN` = no live observation yet (also blocks release).

## Access and content privacy

| ID | Role / state | Check | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| P-01 | Guest | Visit `/`, `/journal`, `/journal/<id>`, and action endpoints | Private routes/actions expose no diary data and require login (redirect or authorization failure). | NOT RUN | |
| P-02 | Authenticated non-member | Visit the same routes and use a known entry ID | No private-space data, signed URL, or mutation succeeds; private-space access is denied. | NOT RUN | |
| P-03 | Author / own today diary | Route and metadata | Author can reach the entry and see its normal card and full fields. | NOT RUN | |
| P-04 | Recipient / future before `open_at` | Card metadata | May see only sender, sealed time, scheduled opening time, and countdown; no title, body, image path, or signed URL. | NOT RUN | |
| P-05 | Recipient / time reached, unopened | Card metadata and route | Still sees no title/body/image path/signed URL; the designated recipient alone may see the active opening affordance. | NOT RUN | |
| P-06 | Recipient / opened by recipient | Full content | Can read title, body, and authorized image after the active open succeeds. | NOT RUN | |
| P-07 | Author / sent future diary | Full content | Author retains access to the authored diary; recipient opening must not broaden access to non-members. | NOT RUN | |
| P-08 | Non-member / all future states | Metadata and direct route | Sealed, ready, and opened diary content and metadata remain unavailable. | NOT RUN | |

## Mutations and interactions

| ID | Role / state | Check | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| P-09 | Author / own today diary | Edit and delete | Own today diary can be edited/deleted within the application rules; its image cleanup result is recorded. | NOT RUN | |
| P-10 | Recipient | Edit/delete another user's diary | Cannot edit or delete the author's diary. | NOT RUN | |
| P-11 | Author | Open future diary addressed to recipient | Cannot open a diary addressed to the recipient. | NOT RUN | |
| P-12 | Recipient / before `open_at` | Open action | Open fails; title/body/image remain sealed. | NOT RUN | |
| P-13 | Recipient / at or after `open_at` | Open action | Exactly the designated recipient can actively open; repeat use is safe/idempotent and content becomes available only after opening. | NOT RUN | |
| P-14 | Author and recipient / readable entry | Comments | Both permitted active members can read/create allowed comments; comment create/update requires the server-only service-role path. | NOT RUN | |
| P-15 | Guest and non-member | Comments | Cannot list, create, update, or delete comments. | NOT RUN | |
| P-16 | Author and recipient / readable entry | Annotations and replies | Allowed only when the diary is readable and interaction policy permits it; each actor can manage only its own annotation/reply. | NOT RUN | |
| P-17 | Guest, non-member, sealed recipient | Annotations and replies | No listing or mutation succeeds while unauthenticated, outside the space, or before full-content access. | NOT RUN | |
| P-18 | Author and recipient | Notifications | Each sees only notifications addressed to that account; future-open notification has no private diary content leak. | NOT RUN | |
| P-19 | Guest and non-member | Notifications | Cannot read another member's notifications or create a future-open notification. | NOT RUN | |

## Storage and signed URLs

| ID | Role / state | Check | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| P-20 | Author | JPEG, PNG, WebP input | Each valid source type at or below 10 MiB is compressed to WebP; stored output is no more than 800 KiB. | NOT RUN | |
| P-21 | Author | GIF, source >10 MiB, or output >800 KiB | Input is rejected and no canonical journal image remains. | NOT RUN | |
| P-22 | Any browser / guessed object URL | Direct Storage access | `journal-images` is private; a guessed public object URL cannot retrieve the image. | NOT RUN | |
| P-23 | Authorized full-content reader | Signed URL | A signed URL is generated only after full-content authorization and has a 300-second lifetime. | NOT RUN | |
| P-24 | Sealed recipient, guest, non-member | Signed URL | No signed URL is returned or rendered. | NOT RUN | |
| P-25 | Author / forced diary write failure | Orphan cleanup | New uploaded object is removed, or failed removal is represented by a queued cleanup job; no unexplained orphan is left. | NOT RUN | |

## Responsive acceptance

Run every row at 375 px, 768 px, and 1440 px. "Usable" means primary content,
navigation, submit/cancel, sign-out, and reader controls remain visible or
reachable without horizontal clipping.

| ID | Area | 375 px | 768 px | 1440 px | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| R-01 | Login and home | NOT RUN | NOT RUN | NOT RUN | |
| R-02 | Journal center and today/future editors | NOT RUN | NOT RUN | NOT RUN | |
| R-03 | Countdown, future opening, and reader | NOT RUN | NOT RUN | NOT RUN | |
| R-04 | Comments and annotations | NOT RUN | NOT RUN | NOT RUN | |
| R-05 | Calendar, mood, memories, and settings | NOT RUN | NOT RUN | NOT RUN | |

## Release sign-off

Do not sign off while any row is `NOT RUN` or `FAIL`.

| Gate | Status | Evidence / approver |
| --- | --- | --- |
| Automated tests, lint, build, and E2E gate | NOT RUN | |
| Privacy, storage, and responsive matrices | NOT RUN | |
| Production migration approval | NOT RUN | |
| Vercel deployment approval | NOT RUN | |
