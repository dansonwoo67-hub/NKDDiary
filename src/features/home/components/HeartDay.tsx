"use client";

import { Mail } from "lucide-react";
import type { HeartState } from "@/features/calendar/heart-range";
import type { HomeDay } from "@/features/home/queries";
import { EventIcon } from "@/features/calendar/components/EventIcon";

const HEART_CLASS: Record<HeartState, string> = {
  empty: "text-white/80 drop-shadow-[0_1px_0_rgb(71_56_45_/_12%)]",
  a: "text-[rgb(177_211_238)]",
  b: "text-[rgb(238_172_185)]",
  both: "text-[rgb(205_61_90)]",
  private: "text-[rgb(247_204_107)]",
};

function label(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `2026年${month}月${day}日`.replace("2026", date.slice(0, 4));
}

export function HeartDay({
  day,
  view,
  selected,
  onSelect,
}: {
  day: Pick<HomeDay, "date" | "dayOfMonth" | "monthLabel" | "heartState" | "envelopeCount" | "events">;
  view: "month" | "quarter" | "year";
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  const compact = view !== "month";
  return (
    <div className="relative grid justify-items-center gap-1">
      {day.monthLabel ? <span className="h-4 text-[0.68rem] text-[var(--muted-ink)]">{day.monthLabel}</span> : <span className="h-4" />}
      {!compact ? <span className="text-[0.7rem] text-[var(--muted-ink)]">{day.dayOfMonth}</span> : null}
      <button
        type="button"
        aria-label={label(day.date)}
        aria-pressed={selected}
        onClick={() => onSelect(day.date)}
        className={`relative grid place-items-center leading-none outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transform-none ${
          compact ? "h-6 w-6 text-2xl" : "h-9 w-9 text-4xl"
        } ${HEART_CLASS[day.heartState]}`}
      >
        ♥
        {day.envelopeCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-white text-[0.6rem] text-[var(--ink)]">
            <Mail aria-hidden="true" className="h-3 w-3" />
          </span>
        ) : null}
      </button>
      {!compact && day.events.length > 0 ? (
        <div className="flex max-w-16 flex-wrap justify-center gap-0.5">
          {day.events.slice(0, 2).map((event) => (
            <EventIcon key={event.id} event={event} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
