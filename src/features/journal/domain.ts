export type JournalEntryType = "today" | "future";
export type FutureDiaryState = "waiting" | "ready" | "opened";
export type FutureStateInput = { openAt: string; openedAt: string | null };

export function getChinaDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function deriveFutureState(
  entry: FutureStateInput,
  now = new Date(),
): FutureDiaryState {
  if (entry.openedAt) return "opened";

  return now.getTime() >= new Date(entry.openAt).getTime() ? "ready" : "waiting";
}
