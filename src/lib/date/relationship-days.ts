/**
 * Returns today's date as a YYYY-MM-DD string in the Asia/Shanghai timezone.
 *
 * Uses `Intl.DateTimeFormat` with a fixed timezone so the result is the same
 * regardless of whether this runs in the browser (UTC+8) or on a Vercel
 * server (UTC). This prevents the calendar from highlighting "yesterday"
 * when the server is still in UTC while Shanghai has already moved to the
 * next day.
 */
export function getTodayDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Calculate the number of days in a relationship, counting the start date
 * as day 1. Uses the Asia/Shanghai (+08:00) timezone so the result is stable
 * regardless of where the server runs.
 *
 * @param startDate ISO date string in `YYYY-MM-DD` format
 * @returns whole days since the start date (inclusive), minimum 0
 */
export function calculateRelationshipDays(startDate: string): number {
  const start = new Date(`${startDate}T00:00:00+08:00`);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1);
}
