export type CalendarMemoryType = "date" | "anniversary" | "birthday" | "travel" | "todo" | "other";

export function calendarBelongsInMemories(type: CalendarMemoryType, important: boolean) {
  return type === "date"
    || type === "anniversary"
    || type === "birthday"
    || type === "travel"
    || ((type === "todo" || type === "other") && important);
}
