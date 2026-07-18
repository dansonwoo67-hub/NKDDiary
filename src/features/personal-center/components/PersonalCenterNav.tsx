"use client";

import { Archive, Bell, Bookmark, CalendarDays, Clock3, FileText, PenLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const personalSections = [
  { href: "/me/letters", label: "我的日记", description: "已经寄出的信", icon: FileText },
  { href: "/me/drafts", label: "草稿箱", description: "没写完也不丢", icon: PenLine },
  { href: "/me/future", label: "给未来", description: "等待送达的信", icon: Clock3 },
  { href: "/me/comments", label: "评点", description: "划线评论和回复", icon: Bell },
  { href: "/me/bookmarks", label: "收藏", description: "整封信和片段", icon: Bookmark },
  { href: "/me/events", label: "事件", description: "日历提醒", icon: CalendarDays },
];

export function PersonalCenterNav() {
  const pathname = usePathname();
  const onIndex = pathname === "/me";

  return (
    <>
      {!onIndex ? (
        <Link
          href="/me"
          className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--muted-ink)] underline decoration-[rgb(139_117_100_/_35%)] underline-offset-4 md:hidden"
        >
          <Archive aria-hidden="true" className="h-4 w-4" />
          回到个人中心
        </Link>
      ) : null}
      <aside className="hidden w-56 shrink-0 md:block">
        <Link href="/me" className="mb-4 block rounded-2xl px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-white/55">
          个人中心
        </Link>
        <nav className="space-y-1" aria-label="资料库">
          {personalSections.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-[var(--muted-ink)] transition hover:bg-white/60 hover:text-[var(--ink)] aria-current:bg-white/75 aria-current:text-[var(--ink)]"
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
