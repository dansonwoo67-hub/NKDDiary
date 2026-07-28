import type { NotificationItem } from "./actions";

export function selectRecentNotifications(items: NotificationItem[], limit = 5) {
  return [...items]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}
