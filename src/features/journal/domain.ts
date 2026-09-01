import { toRelationshipDate } from "@/lib/date/relationship-date";

export type JournalEntryType = "today" | "future";
export type FutureDiaryState = "waiting" | "ready" | "opened";
export type FutureStateInput = { openAt: string; openedAt: string | null };
export type TodayDiaryManageInput = {
  entryType: JournalEntryType;
  authorId: string;
  lockedAt: string;
};

export function getChinaDate(value = new Date()) {
  return toRelationshipDate(value);
}

export function deriveFutureState(
  entry: FutureStateInput,
  now = new Date(),
): FutureDiaryState {
  if (entry.openedAt) return "opened";

  return now.getTime() >= new Date(entry.openAt).getTime() ? "ready" : "waiting";
}

export function canManageTodayDiary(
  entry: TodayDiaryManageInput,
  userId: string,
  now = new Date(),
) {
  return entry.entryType === "today" && entry.authorId === userId && new Date(entry.lockedAt).getTime() > now.getTime();
}

export function isTodayDiaryLocked(entry: TodayDiaryManageInput, now = new Date()) {
  return entry.entryType === "today" && new Date(entry.lockedAt).getTime() <= now.getTime();
}
