export type CalendarRecurrence = "none" | "monthly" | "yearly";

function parts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getEventOccurrenceInMonth(
  eventDate: string,
  recurrence: CalendarRecurrence,
  year: number,
  month: number,
): string | null {
  const original = parts(eventDate);
  if (recurrence === "none") return original.year === year && original.month === month ? eventDate : null;
  if (recurrence === "yearly" && original.month !== month) return null;
  const candidate = formatDate(year, month, Math.min(original.day, daysInMonth(year, month)));
  return candidate >= eventDate ? candidate : null;
}

export function getMostRecentOccurrence(
  eventDate: string,
  recurrence: CalendarRecurrence,
  today: string,
): string | null {
  if (eventDate > today) return null;
  if (recurrence === "none") return eventDate;
  const current = parts(today);
  let candidate = getEventOccurrenceInMonth(eventDate, recurrence, current.year, recurrence === "yearly" ? parts(eventDate).month : current.month);
  if (candidate && candidate <= today) return candidate;

  if (recurrence === "monthly") {
    const previous = new Date(Date.UTC(current.year, current.month - 2, 1));
    candidate = getEventOccurrenceInMonth(eventDate, recurrence, previous.getUTCFullYear(), previous.getUTCMonth() + 1);
  } else {
    candidate = getEventOccurrenceInMonth(eventDate, recurrence, current.year - 1, parts(eventDate).month);
  }
  return candidate && candidate <= today ? candidate : null;
}
