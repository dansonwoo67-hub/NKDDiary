import type { CalendarEventChip } from "@/features/calendar/types";
import type { MemoryItem } from "@/features/memories/repository";
import { compareMemoryChronology } from "@/features/memories/domain";

type HomeCalendarDay = {
  date: string;
  events: CalendarEventChip[];
};

export function buildHomeOverview({
  memories,
  calendarDays,
  today,
}: {
  memories: MemoryItem[];
  calendarDays: HomeCalendarDay[];
  today: string;
}) {
  const recentMemories = [...memories]
    .filter((item) => item.kind === "memory" || item.kind === "mood")
    .sort(compareMemoryChronology);

  const upcomingEvents = calendarDays
    .filter((day) => day.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((day) => day.events.map((event) => ({ ...event, date: day.date })))
    .slice(0, 3);

  return { recentMemories, upcomingEvents };
}
