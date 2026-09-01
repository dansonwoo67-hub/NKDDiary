# Notification Target Contract

## State separation

- `isRead`: the recipient has read this notification.
- `isActive`: the notification remains active under product rules.
- `target`: the destination and optional in-content anchor.

Reading does not remove navigation. An active read notification remains navigable. Badge queries remain exclusively:

```text
recipient_id = currentUser
AND is_read = false
AND is_active = true
```

## Targets

- `memory`
- `memory_comment`
- `memory_reply`
- `letter_thread`
- `calendar_event`
- `calendar_date`
- `relationship_setting`

Comment and reply IDs are anchors; the Memory ID remains the target content identity. Letter ID may select a letter inside a stored thread. URL construction is centralized in `buildNotificationHref`.

## Compatibility

This batch does not replace the current notification center mapping. Adoption requires a later data adapter and navigation tests so existing withdrawn-letter safety and mark-read rollback behavior remain intact.
