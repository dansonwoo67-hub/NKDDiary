import { describe, expect, it } from "vitest";
import { buildHeartDays, getCalendarRange, type HeartCalendarRow } from "./heart-range";

const rowsWithDraft: HeartCalendarRow[] = [
  { authorId: "a", date: "2026-07-10", status: "draft", kind: "daily" },
];

describe("heart calendar ranges", () => {
  it("keeps month days inside one calendar month", () => {
    expect(getCalendarRange("month", new Date("2026-08-15T00:00:00+08:00"))).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("keeps quarter days continuous over month boundaries", () => {
    expect(getCalendarRange("quarter", new Date("2026-08-15T00:00:00+08:00"))).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
  });

  it("keeps year days continuous over the full year", () => {
    expect(getCalendarRange("year", new Date("2026-08-15T00:00:00+08:00"))).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("shows private yellow only to the owner", () => {
    expect(buildHeartDays(rowsWithDraft, "a", { start: "2026-07-10", end: "2026-07-10" })[0].state).toBe("private");
    expect(buildHeartDays(rowsWithDraft, "b", { start: "2026-07-10", end: "2026-07-10" })[0].state).toBe("empty");
  });

  it("colors public daily letters by author while ignoring time capsules for heart state", () => {
    const rows: HeartCalendarRow[] = [
      { authorId: "a", date: "2026-07-10", status: "published", kind: "daily" },
      { authorId: "b", date: "2026-07-10", status: "published", kind: "daily" },
      { authorId: "a", date: "2026-07-11", status: "published", kind: "time_capsule" },
    ];

    const days = buildHeartDays(rows, "a", { start: "2026-07-10", end: "2026-07-11" });

    expect(days[0]).toMatchObject({ date: "2026-07-10", state: "both", envelopeCount: 0 });
    expect(days[1]).toMatchObject({ date: "2026-07-11", state: "empty", envelopeCount: 1 });
  });

  it("adds a month label only where a month starts", () => {
    const days = buildHeartDays([], "a", { start: "2026-07-30", end: "2026-08-02" });

    expect(days.map((day) => day.monthLabel)).toEqual([null, null, "八月", null]);
  });
});
