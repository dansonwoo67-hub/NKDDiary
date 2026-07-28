import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import type { CalendarEventChip } from "@/features/calendar/types";

type UpcomingEvent = CalendarEventChip & { date: string };

export function UpcomingCard({ events }: { events: UpcomingEvent[] }) {
  return (
    <section className="cos-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
          <CalendarDays aria-hidden="true" size={18} className="text-[var(--orange)]" />
          接下来
        </h2>
        <Link href="/calendar" className="flex min-h-10 items-center gap-1 text-xs text-[var(--rose)]">
          查看日历 <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>
      {events.length ? (
        <div className="mt-3 divide-y divide-[var(--line)]">
          {events.map((item) => (
            <div key={`${item.date}-${item.id}`} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/70 text-base">{item.icon}</span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
              <time className="shrink-0 text-xs text-[var(--muted-ink)]">{item.date.slice(5).replace("-", "/")}</time>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-[var(--muted-ink)]">最近没有安排，留一点空白也很好。</p>
      )}
    </section>
  );
}
