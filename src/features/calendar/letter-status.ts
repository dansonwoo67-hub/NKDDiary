export function deriveCalendarLetterStatus({
  sealed,
  hasUnreadNotification,
}: {
  sealed: boolean;
  hasUnreadNotification: boolean;
}): "sealed" | "unread" | "read" {
  if (sealed) return "sealed";
  return hasUnreadNotification ? "unread" : "read";
}
