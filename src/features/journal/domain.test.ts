import { describe, expect, it } from "vitest";
import { canManageTodayDiary, deriveFutureState, getChinaDate, isTodayDiaryLocked } from "./domain";

describe("future diary domain", () => {
  it("uses the relationship calendar date", () => {
    expect(getChinaDate(new Date("2026-07-19T16:30:00Z"))).toBe("2026-07-20");
  });

  it("requires an explicit open after the scheduled time", () => {
    const entry = { openAt: "2026-08-01T12:00:00Z", openedAt: null };

    expect(deriveFutureState(entry, new Date("2026-08-01T11:59:59Z"))).toBe("waiting");
    expect(deriveFutureState(entry, new Date("2026-08-01T12:00:00Z"))).toBe("ready");
  });

  it("is opened only when an explicit open has been recorded", () => {
    const entry = {
      openAt: "2026-08-01T12:00:00Z",
      openedAt: "2026-08-01T12:00:01Z",
    };

    expect(deriveFutureState(entry, new Date("2026-08-01T11:00:00Z"))).toBe("opened");
  });
});

describe("today diary domain", () => {
  it("allows only the author before the server-provided lock time", () => {
    const entry = { entryType: "today" as const, authorId: "author", lockedAt: "2026-07-20T10:00:00Z" };

    expect(canManageTodayDiary(entry, "author", new Date("2026-07-20T09:59:59Z"))).toBe(true);
    expect(canManageTodayDiary(entry, "partner", new Date("2026-07-20T09:59:59Z"))).toBe(false);
    expect(canManageTodayDiary(entry, "author", new Date("2026-07-20T10:00:00Z"))).toBe(false);
    expect(isTodayDiaryLocked(entry, new Date("2026-07-20T09:59:59Z"))).toBe(false);
    expect(isTodayDiaryLocked(entry, new Date("2026-07-20T10:00:00Z"))).toBe(true);
  });
});
