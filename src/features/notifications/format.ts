import type { NotificationItem } from "./actions";

export type FormattedNotification = {
  title: string;
  subtitle: string;
  targetUrl: string;
  icon: string;
  category: "letter" | "activity" | "calendar" | "profile" | "comment";
};

// Exact type mappings - NO fuzzy matching
const TYPE_CONFIG: Record<string, {
  title: string;
  category: FormattedNotification["category"];
  icon: string;
}> = {
  // Profile
  "profile_nickname_updated": { title: "更新了昵称", category: "profile", icon: "user" },
  "profile_avatar_updated": { title: "更换了头像", category: "profile", icon: "image" },
  "profile_updated": { title: "更新了资料", category: "profile", icon: "settings" },
  "partner_nickname_updated": { title: "修改了对你的称呼", category: "profile", icon: "heart" },

  // Mood
  "mood_created": { title: "更新了心情", category: "activity", icon: "heart" },
  "mood_updated": { title: "更新了心情", category: "activity", icon: "heart" },

  // Memory
  "memory_created": { title: "新增了一段回忆", category: "activity", icon: "camera" },
  "memory_updated": { title: "更新了回忆", category: "activity", icon: "camera" },

  // Calendar - title comes from database, these are fallbacks
  "calendar_event_created": { title: "新增了事件", category: "calendar", icon: "calendar" },
  "calendar_event_updated": { title: "更新了事件", category: "calendar", icon: "calendar" },
  "calendar_event": { title: "新增了事件", category: "calendar", icon: "calendar" },

  // Comments
  "journal_comment_created": { title: "评论了你的信", category: "comment", icon: "message-circle" },
  "journal_reply_created": { title: "回复了你的评论", category: "comment", icon: "reply" },

  // Letters
  "journal_created": { title: "寄来一封信", category: "letter", icon: "mail" },
  "future_diary_opened": { title: "开启了未来日记", category: "letter", icon: "mail" },
};

export function formatNotification(item: NotificationItem): FormattedNotification {
  const config = TYPE_CONFIG[item.type];
  
  // Unknown type - handle gracefully
  if (!config) {
    if (process.env.NODE_ENV === "development") {
      console.error("Unknown notification type:", item.type);
    }
    return {
      title: "有一条新的互动",
      subtitle: "",
      targetUrl: "/",
      icon: "info",
      category: "activity",
    };
  }
  
  // Build subtitle from body if available
  let subtitle = "";
  if (item.body && item.body.length > 0) {
    if (item.type === "profile_nickname_updated") {
      subtitle = item.body;
    } else if (item.type === "partner_nickname_updated") {
      subtitle = item.body;
    } else if (item.type.includes("calendar")) {
      subtitle = item.body;
    } else if (item.type.includes("mood")) {
      subtitle = `"${item.body}"`;
    } else if (item.type.includes("comment") || item.type.includes("reply")) {
      subtitle = `"${item.body}"`;
    } else {
      subtitle = item.body;
    }
  }

  // Build target URL
  const targetUrl = item.href;

  // For calendar events, use item.title from database (already contains specific titles like "安排了一次约会")
  // For other types, use config.title as fallback
  const title = item.type.includes("calendar") ? item.title : config.title;
  
  return {
    title,
    subtitle,
    targetUrl,
    icon: config.icon,
    category: config.category,
  };
}

// Format date for display (MM-DD HH:mm)
export function formatNotificationDate(dateStr: string): { date: string; time: string } {
  const date = new Date(dateStr);
  const formattedDate = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const formattedTime = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return { date: formattedDate, time: formattedTime };
}
