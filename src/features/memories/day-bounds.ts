import { toRelationshipDate } from "@/lib/date/relationship-date";

export function getMemoryDayBounds(now = new Date()) {
  const businessDate = toRelationshipDate(now);
  const start = new Date(`${businessDate}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}
