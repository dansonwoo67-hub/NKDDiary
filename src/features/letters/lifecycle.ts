export type LetterKind = "daily" | "time_capsule";
export type LetterStatus = "draft" | "scheduled" | "published" | "withdrawn";

export function canWithdrawLetter(publishedAt: string, now = new Date()) {
  return now.getTime() <= new Date(publishedAt).getTime() + 24 * 60 * 60 * 1000;
}

export function validateSchedule(kind: LetterKind, scheduledFor: string | null, now = new Date()) {
  if (kind === "daily") return scheduledFor === null ? { ok: true as const } : { ok: false as const, message: "今日日记不能预约发布" };
  const scheduledTime = scheduledFor ? new Date(scheduledFor).getTime() : Number.NaN;
  const scheduledDate = scheduledFor ? getShanghaiDate(scheduledFor) : null;
  const today = getShanghaiDate(now);
  if (
    !Number.isFinite(scheduledTime) ||
    scheduledTime <= now.getTime() ||
    scheduledDate === null ||
    today === null ||
    scheduledDate <= today
  ) {
    return { ok: false as const, message: "请选择未来的日期和时间" };
  }
  return { ok: true as const };
}

export function getShanghaiDate(value: string | Date): string | null {
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");

  return year && month && day ? `${year}-${month}-${day}` : null;
}
