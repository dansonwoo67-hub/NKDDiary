function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function lastUtcDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function resolveRecurringEventDateOnly(eventDate: string, targetYear: number, targetMonth: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!match) throw new Error("Invalid date-only value");
  const originalDay = Number(match[3]);
  const safeDay = Math.min(originalDay, lastUtcDayOfMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

export function resolveRecurringEventDate(eventDate: Date, targetYear: number, targetMonthIndex: number) {
  const originalDay = eventDate.getDate();
  const safeDay = Math.min(originalDay, lastDayOfMonth(targetYear, targetMonthIndex));
  return new Date(targetYear, targetMonthIndex, safeDay);
}
