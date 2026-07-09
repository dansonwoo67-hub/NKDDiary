function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function resolveRecurringEventDate(eventDate: Date, targetYear: number, targetMonthIndex: number) {
  const originalDay = eventDate.getDate();
  const safeDay = Math.min(originalDay, lastDayOfMonth(targetYear, targetMonthIndex));
  return new Date(targetYear, targetMonthIndex, safeDay);
}
