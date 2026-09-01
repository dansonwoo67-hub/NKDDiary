"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Sparkles } from "lucide-react";
import { markNotificationReadAction, resolveLetterNotificationAction, validateJournalEntryForUser, type NotificationItem } from "@/features/notifications/actions";
import { formatNotification, formatNotificationDate } from "@/features/notifications/format";

function Panel({ items, onOpen, empty, isInbox }: { items: NotificationItem[]; onOpen: (x: NotificationItem) => void; empty: string; isInbox?: boolean }) {
  return (
    <div className="notification-popover" role="menu">
      <div className="max-h-72 overflow-y-auto p-2">
        {items.length ? items.map(i => {
          const formatted = formatNotification(i);
          const { date, time } = formatNotificationDate(i.createdAt);
          return (
            <button 
              key={i.id} 
              type="button" 
              onClick={() => onOpen(i)} 
              className={`notification-row ${i.isRead ? "is-read" : "is-unread"}`}
            >
              <div className="flex items-start gap-2 w-full">
                {/* Time column */}
                <span className="text-xs text-[var(--muted-ink)] shrink-0 mt-0.5">
                  {date} {time}
                </span>
                {/* Content area */}
                <div className="flex-1 min-w-0">
                  {/* First row: actor + action */}
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{i.actorName}</span>
                    <span className="font-bold">{formatted.title}</span>
                    {!i.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
                    )}
                  </div>
                  {/* Second row: content summary */}
                  {!isInbox && formatted.subtitle && formatted.subtitle.length > 0 && (
                    <span className="text-xs text-[var(--muted-ink)] truncate block mt-0.5">
                      {formatted.subtitle}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        }) : (
          <p className="px-3 py-5 text-center text-sm text-[var(--muted-ink)]">{empty}</p>
        )}
      </div>
    </div>
  );
}

type Props = {
  accountId: string;
  inbox: NotificationItem[];
  activity: NotificationItem[];
  inboxUnreadCount: number;
  activityUnreadCount: number;
};

function getNotificationStateKey(props: Props) {
  return [
    props.accountId,
    props.inboxUnreadCount,
    props.activityUnreadCount,
    JSON.stringify(props.inbox),
    JSON.stringify(props.activity),
  ].join("|");
}

export function NotificationCenterClient(props: Props) {
  return <NotificationCenterState key={getNotificationStateKey(props)} {...props} />;
}

function NotificationCenterState({
  inbox: ii,
  activity: ia,
  inboxUnreadCount: initialInboxUnreadCount,
  activityUnreadCount: initialActivityUnreadCount,
}: Props) {
  const router = useRouter();
  const [inbox, setInbox] = useState(ii);
  const [activity, setActivity] = useState(ia);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(initialInboxUnreadCount);
  const [activityUnreadCount, setActivityUnreadCount] = useState(initialActivityUnreadCount);
  const [open, setOpen] = useState<"inbox" | "activity" | null>(null);
  const [pinned, setPinned] = useState<typeof open>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const pendingReadIds = useRef(new Set<string>());
  const cancelled = useRef(false);

  useEffect(() => () => {
    cancelled.current = true;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  function enter(k: "inbox" | "activity") {
    if (timer.current) clearTimeout(timer.current);
    setOpen(k);
  }

  function leave() {
    if (pinned) return;
    timer.current = window.setTimeout(() => setOpen(null), 260);
  }

  function toggle(k: "inbox" | "activity") {
    const n = pinned === k ? null : k;
    setPinned(n);
    setOpen(n);
  }

  async function go(item: NotificationItem, k: "inbox" | "activity") {
    if (pendingReadIds.current.has(item.id)) return;

    let targetHref = item.relatedEntryId
      ? `/journal/${item.relatedEntryId}#comment-${item.sourceId}`
      : item.href;
    const isLetterNotification = item.type === "journal_created" || item.type === "future_diary_opened";

    if (isLetterNotification) {
      const resolved = await resolveLetterNotificationAction(item.id);
      if (cancelled.current) return;
      if (!resolved.ok || !resolved.href) {
        setErrorMessage(resolved.message || "这条提醒已失效。");
        return;
      }
      targetHref = resolved.href;
    }

    // Validate journal entry access for journal-related notifications
    if (!isLetterNotification && (item.type.includes("journal") || item.type.includes("future_diary"))) {
      const validation = await validateJournalEntryForUser(item.relatedEntryId || item.sourceId);
      if (cancelled.current) return;
      if (!validation.ok) {
        setErrorMessage(validation.message);
        return;
      }
    }

    // Mark as read (optimistic update + server action)
    if (!item.isRead) {
      const upd = (xs: NotificationItem[]) => xs.map(x => x.id === item.id ? { ...x, isRead: true } : x);
      const rollback = (xs: NotificationItem[]) => xs.map(x => x.id === item.id ? { ...x, isRead: false } : x);
      if (k === "inbox") {
        setInbox(upd);
        setInboxUnreadCount((count) => Math.max(0, count - 1));
      } else {
        setActivity(upd);
        setActivityUnreadCount((count) => Math.max(0, count - 1));
      }
      pendingReadIds.current.add(item.id);
      try {
        const result = await markNotificationReadAction(item.id);
        if (cancelled.current) return;
        if (!result.ok) {
          if (k === "inbox") {
            setInbox(rollback);
            setInboxUnreadCount((count) => count + 1);
          } else {
            setActivity(rollback);
            setActivityUnreadCount((count) => count + 1);
          }
          setErrorMessage("标记已读失败，请检查网络后重试。");
          return;
        }
      } catch {
        if (cancelled.current) return;
        if (k === "inbox") {
          setInbox(rollback);
          setInboxUnreadCount((count) => count + 1);
        } else {
          setActivity(rollback);
          setActivityUnreadCount((count) => count + 1);
        }
        setErrorMessage("标记已读失败，请检查网络后重试。");
        return;
      } finally {
        pendingReadIds.current.delete(item.id);
      }
    }

    setOpen(null);
    setPinned(null);

    router.push(targetHref);
    router.refresh();
  }

  return (
    <nav aria-label="消息入口" className="notification-tabs">
      {errorMessage && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 shadow-lg">
          {errorMessage}
        </div>
      )}
      <div className="relative" onMouseEnter={() => enter("inbox")} onMouseLeave={leave}>
        <button type="button" aria-label="收信箱" onClick={() => toggle("inbox")} className={`notification-tab notification-tab--inbox ${inboxUnreadCount ? "has-unread" : ""}`}>
          <Mail size={26} />
          <span className="max-[480px]:hidden">收信箱</span>
          {inboxUnreadCount ? <b>{inboxUnreadCount}</b> : null}
        </button>
        {open === "inbox" ? <Panel items={inbox} onOpen={x => go(x, "inbox")} empty="这里暂时没有新的来信，等 TA 寄来第一封信吧。" isInbox /> : null}
      </div>
      <div className="relative" onMouseEnter={() => enter("activity")} onMouseLeave={leave}>
        <button type="button" aria-label="新动态" onClick={() => toggle("activity")} className={`notification-tab notification-tab--activity ${activityUnreadCount ? "has-unread" : ""}`}>
          <Sparkles size={25} />
          <span className="max-[480px]:hidden">新动态</span>
          {activityUnreadCount ? <b>{activityUnreadCount}</b> : null}
        </button>
        {open === "activity" ? <Panel items={activity} onOpen={x => go(x, "activity")} empty="这里还安安静静的，等你们一起留下第一段故事。" /> : null}
      </div>
    </nav>
  );
}
