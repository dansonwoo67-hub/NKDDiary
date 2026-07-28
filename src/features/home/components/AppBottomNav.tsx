"use client";

import Link from "next/link";
import { BookOpen, CalendarDays, Clock3, Home, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_NAVIGATION } from "@/features/home/navigation";

const icons = {
  home: Home,
  memories: Clock3,
  journal: BookOpen,
  calendar: CalendarDays,
  settings: Settings,
} as const;

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航" className="cos-bottom-nav">
      <div className="mx-auto grid w-full max-w-3xl grid-cols-5 gap-1 px-2">
        {APP_NAVIGATION.map((item) => {
          const Icon = icons[item.icon];
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="cos-nav-item"
            >
              <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
