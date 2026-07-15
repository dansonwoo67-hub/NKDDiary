export type CalendarView = "month" | "quarter" | "year";
export type HeartState = "empty" | "a" | "b" | "both" | "private";

export type HeartCalendarRow = {
  authorId: string;
  date: string;
  status: "draft" | "scheduled" | "published" | "withdrawn";
  kind: "daily" | "time_capsule";
};

export type HeartCalendarDay = {
  date: string;
  dayOfMonth: number;
  monthLabel: string | null;
  state: HeartState;
  envelopeCount: number;
};

export type CalendarRange = {
  start: string;
  end: string;
};

const MONTH_LABELS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

function dateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shanghaiParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function endOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getCalendarRange(view: CalendarView, anchor: Date): CalendarRange {
  const { year, month } = shanghaiParts(anchor);
  if (view === "year") {
    return { start: dateString(year, 1, 1), end: dateString(year, 12, 31) };
  }
  if (view === "quarter") {
    const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
    const quarterEnd = quarterStart + 2;
    return {
      start: dateString(year, quarterStart, 1),
      end: dateString(year, quarterEnd, endOfMonth(year, quarterEnd)),
    };
  }
  return { start: dateString(year, month, 1), end: dateString(year, month, endOfMonth(year, month)) };
}

function daysInRange(range: CalendarRange) {
  const [startYear, startMonth, startDay] = range.start.split("-").map(Number);
  const [endYear, endMonth, endDay] = range.end.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const last = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const result: string[] = [];

  while (cursor <= last) {
    result.push(dateString(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function authorSlots(rows: HeartCalendarRow[]) {
  return Array.from(new Set(rows.map((row) => row.authorId))).sort();
}

function publicState(authors: Set<string>, slots: string[]): HeartState {
  const [aId, bId] = slots;
  const a = Boolean(aId && authors.has(aId));
  const b = Boolean(bId && authors.has(bId));
  if (a && b) return "both";
  if (a) return "a";
  if (b) return "b";
  return "empty";
}

export function buildHeartDays(
  rows: HeartCalendarRow[],
  viewerId: string,
  range: CalendarRange,
  authorOrder?: string[],
): HeartCalendarDay[] {
  const slots = authorOrder ?? authorSlots(rows);
  const rowsByDate = new Map<string, HeartCalendarRow[]>();
  for (const row of rows) {
    if (row.date < range.start || row.date > range.end) continue;
    rowsByDate.set(row.date, [...(rowsByDate.get(row.date) ?? []), row]);
  }

  return daysInRange(range).map((date) => {
    const rowsForDay = rowsByDate.get(date) ?? [];
    const publishedDailyAuthors = new Set(
      rowsForDay
        .filter((row) => row.kind === "daily" && row.status === "published")
        .map((row) => row.authorId),
    );
    const hasViewerPrivate = rowsForDay.some(
      (row) => row.authorId === viewerId && (row.status === "draft" || row.status === "scheduled"),
    );
    const [, month, day] = date.split("-").map(Number);
    const state = hasViewerPrivate ? "private" : publicState(publishedDailyAuthors, slots);
    const envelopeCount = rowsForDay.filter((row) => row.kind === "time_capsule" && row.status === "published").length;

    return {
      date,
      dayOfMonth: day,
      monthLabel: day === 1 ? MONTH_LABELS[month - 1] : null,
      state,
      envelopeCount,
    };
  });
}
