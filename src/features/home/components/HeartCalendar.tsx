"use client";

import Link from "next/link";
import { useState } from "react";
import type { CalendarView } from "@/features/calendar/heart-range";
import type { HomeDay } from "@/features/home/queries";
import { EventDialog } from "@/features/calendar/components/EventDialog";
import { HeartDay } from "./HeartDay";

export type HeartCalendarDayView = Pick<HomeDay, "date" | "dayOfMonth" | "monthLabel" | "heartState" | "envelopeCount" | "events">;

const GRID_CLASS: Record<CalendarView, string> = {
  month: "grid-cols-7 gap-x-2 gap-y-3",
  quarter: "grid-flow-col grid-rows-7 auto-cols-[1.85rem] gap-x-2 gap-y-2 overflow-x-auto pb-2",
  year: "grid-flow-col grid-rows-7 auto-cols-[1.15rem] gap-x-1 gap-y-1 overflow-x-auto pb-2",
};

function visibleDays(days: HeartCalendarDayView[], view: CalendarView, anchorDate: string) {
  const [year, month] = anchorDate.split("-").map(Number);
  if (view === "year") return days.filter((day) => day.date.startsWith(`${year}-`));
  if (view === "quarter") {
    const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const endMonth = startMonth + 2;
    return days.filter((day) => {
      const dayMonth = Number(day.date.slice(5, 7));
      return day.date.startsWith(`${year}-`) && dayMonth >= startMonth && dayMonth <= endMonth;
    });
  }
  return days.filter((day) => day.date.startsWith(`${year}-${String(month).padStart(2, "0")}-`));
}

export function HeartCalendar({
  days,
  initialView = "month",
  anchorDate = new Date().toISOString().slice(0, 10),
}: {
  days: HeartCalendarDayView[];
  initialView?: CalendarView;
  anchorDate?: string;
}) {
  const [view, setView] = useState<CalendarView>(initialView);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const shownDays = visibleDays(days, view, anchorDate);

  return (
    <section className="hand-card rounded-[2rem] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">HEART CALENDAR</p>
          <h2 className="mt-1 text-2xl font-semibold">共同生活日历</h2>
        </div>
        <div className="flex rounded-full bg-white/60 p-1" aria-label="日历视角">
          {([
            ["month", "月"],
            ["quarter", "季度"],
            ["year", "年"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className="min-h-10 rounded-full px-4 text-sm text-[var(--muted-ink)] transition aria-pressed:bg-[var(--ink)] aria-pressed:text-white"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div data-testid="heart-strip" data-view={view} className={`mt-6 grid ${GRID_CLASS[view]}`}>
        {shownDays.map((day) => (
          <HeartDay
            key={day.date}
            day={day}
            view={view}
            selected={selectedDate === day.date}
            onSelect={setSelectedDate}
          />
        ))}
      </div>

      {selectedDate ? (
        <div className="mt-6 rounded-[1.5rem] border border-[rgb(71_56_45_/_12%)] bg-white/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--ink)]">{selectedDate}</p>
            <Link href={`/letters/${selectedDate}`} className="rounded-full bg-white/70 px-3 py-2 text-sm text-[var(--ink)] hover:bg-white">
              查看当日内容
            </Link>
          </div>
          <div className="mt-4">
            <EventDialog defaultDate={selectedDate} defaultOpen summary="添加事件" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
