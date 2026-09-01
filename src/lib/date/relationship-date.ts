export const RELATIONSHIP_TIME_ZONE = "Asia/Taipei";

export type RelationshipDate = `${number}-${number}-${number}`;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RELATIONSHIP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function assertRelationshipDate(value: string): RelationshipDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Invalid relationship date");
  return value as RelationshipDate;
}

export function toRelationshipDate(value: Date | string | number): RelationshipDate {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return assertRelationshipDate(value);
  }
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new RangeError("Invalid relationship instant");
  return assertRelationshipDate(dateFormatter.format(instant));
}

export function getTodayInRelationshipTimezone(now = new Date()): RelationshipDate {
  return toRelationshipDate(now);
}

function dateParts(value: RelationshipDate) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function formatRelationshipDate(value: Date | string | number): string {
  const { year, month, day } = dateParts(toRelationshipDate(value));
  return `${year}年${month}月${day}日`;
}

export function formatRelationshipDateTime(value: Date | string | number): string {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new RangeError("Invalid relationship instant");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RELATIONSHIP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${Number(part("year"))}年${Number(part("month"))}月${Number(part("day"))}日 ${part("hour")}:${part("minute")}`;
}

export function compareRelationshipDates(left: Date | string | number, right: Date | string | number): -1 | 0 | 1 {
  const leftDate = toRelationshipDate(left);
  const rightDate = toRelationshipDate(right);
  return leftDate < rightDate ? -1 : leftDate > rightDate ? 1 : 0;
}
