import Link from "next/link";
import type { MonthCalendarState } from "@/features/calendar/actions";
import { EventIcon } from "@/features/calendar/components/EventIcon";

function heatClass(recordCount: number) {
  if (recordCount >= 2) return "bg-[rgb(229_139_143_/_48%)]";
  if (recordCount === 1) return "bg-[rgb(229_139_143_/_25%)]";
  return "bg-white/55";
}

export function MonthHeatmap({ state, compact = false }: { state: MonthCalendarState; compact?: boolean }) {
  return (
    <section className="hand-card rounded-[2rem] p-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">MONTH</p>
          <h2 className="mt-1 text-2xl font-semibold">
            {state.year} 年 {state.month} 月
          </h2>
        </div>
        <Link href="/calendar" className="rounded-full bg-white/70 px-4 py-2 text-sm">
          日历
        </Link>
      </div>

      <div data-testid="month-grid" data-density={compact ? "compact" : "comfortable"} className={`mt-5 grid grid-cols-7 ${compact ? "gap-1" : "gap-2"}`}>
        {state.days.map((day) => (
          <Link
            href={`/journal?date=${day.date}`}
            key={day.date}
            className={`${compact ? "min-h-12 rounded-xl p-1" : "min-h-20 rounded-2xl p-2"} transition hover:-translate-y-0.5 ${heatClass(day.recordCount)}`}
          >
            <span className="text-xs text-[var(--muted-ink)]">{day.dayOfMonth}</span>
            <div className="mt-2 flex flex-wrap gap-1">
              {day.events.slice(0, 2).map((event) => (
                <EventIcon key={event.id} event={event} />
              ))}
              {day.events.length > 2 ? <span className="grid h-6 w-6 place-items-center rounded-full bg-white/60 text-xs">·</span> : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
