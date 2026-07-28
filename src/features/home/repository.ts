import type { CalendarEventChip } from "@/features/calendar/types";
import type { MemoryItem } from "@/features/memories/repository";

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
    .sort((a, b) => {
      const bTime = Date.parse(b.createdAt ?? b.occurredAt);
      const aTime = Date.parse(a.createdAt ?? a.occurredAt);
      return bTime - aTime;
    });

  const upcomingEvents = calendarDays
    .filter((day) => day.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((day) => day.events.map((event) => ({ ...event, date: day.date })))
    .slice(0, 3);

  return { recentMemories, upcomingEvents };
}
