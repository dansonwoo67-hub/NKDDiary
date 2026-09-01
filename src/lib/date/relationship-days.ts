import { getTodayInRelationshipTimezone } from "./relationship-date";

/**
 * Returns today's date as a YYYY-MM-DD string in the relationship timezone.
 *
 * Uses `Intl.DateTimeFormat` with a fixed timezone so the result is the same
 * regardless of whether this runs in the browser (UTC+8) or on a Vercel
 * server (UTC). This prevents the calendar from highlighting "yesterday"
 * when the server is still in UTC while the relationship timezone has moved to the
 * next day.
 */
export function getTodayDateStr(now = new Date()): string {
  return getTodayInRelationshipTimezone(now);
}

/**
 * Calculate the number of days in a relationship, counting the start date
 * as day 1. Uses the relationship timezone so the result is stable
 * regardless of where the server runs.
 *
 * @param startDate ISO date string in `YYYY-MM-DD` format
 * @returns whole days since the start date (inclusive), minimum 0
 */
export function calculateRelationshipDays(startDate: string, now = new Date()): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const today = Date.parse(`${getTodayInRelationshipTimezone(now)}T00:00:00Z`);
  return Math.max(0, Math.floor((today - start) / 86_400_000) + 1);
}
