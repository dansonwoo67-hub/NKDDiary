import {
  getNotificationCenterData,
  getUnreadNotificationState,
} from "@/features/notifications/actions";
import { NotificationCenterClient } from "./NotificationCenterClient";

export async function NotificationBell({ userId }: { userId: string }) {
  const [data, unread] = await Promise.all([
    getNotificationCenterData(),
    getUnreadNotificationState(),
  ]);
  return (
    <NotificationCenterClient
      key={userId}
      accountId={userId}
      inbox={data.inbox}
      activity={data.activity}
      inboxUnreadCount={unread.inboxCount}
      activityUnreadCount={unread.activityCount}
    />
  );
}
