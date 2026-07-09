import Link from "next/link";
import { getUnreadNotifications, markNotificationReadAction } from "@/features/notifications/actions";

async function markNotificationReadForm(formData: FormData) {
  "use server";

  await markNotificationReadAction(String(formData.get("id") ?? ""));
}

export async function NotificationBell() {
  const notifications = await getUnreadNotifications();

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full bg-white/70 px-3 py-1">
        信息
        {notifications.length > 0 ? <span className="h-2 w-2 rounded-full bg-[var(--rose)]" /> : null}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-72 rounded-[1.5rem] border border-[rgb(71_56_45_/_14%)] bg-[var(--paper)] p-3 shadow-xl">
        {notifications.length === 0 ? <p className="p-3 text-sm text-[var(--muted-ink)]">暂无新提醒</p> : null}
        {notifications.map((notification) => (
          <article key={notification.id} className="rounded-2xl bg-white/65 p-3">
            <Link href={notification.href} className="block">
              <p className="text-sm font-medium">{notification.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--muted-ink)]">{notification.body}</p>
            </Link>
            <form action={markNotificationReadForm} className="mt-2">
              <input type="hidden" name="id" value={notification.id} />
              <button className="text-xs text-[var(--muted-ink)]" type="submit">
                标为已读
              </button>
            </form>
          </article>
        ))}
      </div>
    </details>
  );
}
