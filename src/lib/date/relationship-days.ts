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
