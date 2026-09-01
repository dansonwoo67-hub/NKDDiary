export type NotificationTarget =
  | { type: "memory"; memoryId: string }
  | { type: "memory_comment"; memoryId: string; commentId: string }
  | { type: "memory_reply"; memoryId: string; commentId: string; replyId: string }
  | { type: "letter_thread"; threadId: string; letterId?: string }
  | { type: "calendar_event"; eventId: string; date?: string }
  | { type: "calendar_date"; date: string }
  | { type: "relationship_setting"; setting: string };

export type NotificationDomain = {
  id: string;
  recipientId: string;
  type: string;
  sourceId: string;
  target: NotificationTarget;
  isRead: boolean;
  isActive: boolean;
  createdAt: string;
};

const encoded = encodeURIComponent;

export function buildNotificationHref(target: NotificationTarget): string {
  switch (target.type) {
    case "memory":
      return `/memories?focus=${encoded(target.memoryId)}`;
    case "memory_comment":
      return `/memories?focus=${encoded(target.memoryId)}#comment-${encoded(target.commentId)}`;
    case "memory_reply":
      return `/memories?focus=${encoded(target.memoryId)}#reply-${encoded(target.replyId)}`;
    case "letter_thread":
      return `/journal/thread/${encoded(target.threadId)}${target.letterId ? `?letter=${encoded(target.letterId)}` : ""}`;
    case "calendar_event":
      return `/calendar?event=${encoded(target.eventId)}${target.date ? `&date=${encoded(target.date)}` : ""}`;
    case "calendar_date":
      return `/calendar?date=${encoded(target.date)}`;
    case "relationship_setting":
      return `/settings?setting=${encoded(target.setting)}`;
  }
}

export function isNotificationNavigable(notification: Pick<NotificationDomain, "isActive" | "target">): boolean {
  return notification.isActive && buildNotificationHref(notification.target).length > 0;
}

export async function resolveLetterNotificationTarget(
  client: Pick<SupabaseClient, "rpc">,
  notificationId: string,
): Promise<NotificationTarget | null> {
  const { data, error } = await client.rpc("resolve_letter_notification_target", {
    p_notification_id: notificationId,
  });
  if (error) throw new Error("Unable to resolve letter notification target");
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    type: "letter_thread",
    threadId: String(row.thread_id),
    letterId: String(row.letter_id),
  };
}
import type { SupabaseClient } from "@supabase/supabase-js";
