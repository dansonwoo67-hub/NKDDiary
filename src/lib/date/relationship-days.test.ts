import { describe, expect, it, vi } from "vitest";
import { calculateRelationshipDays, getTodayDateStr } from "./relationship-days";

describe("getTodayDateStr", () => {
  it.each([
    ["UTC previous day and Taipei next day", "2026-08-29T16:00:00.000Z", "2026-08-30"],
    ["UTC+8 end of day", "2026-08-30T15:59:59.999Z", "2026-08-30"],
    ["month boundary", "2026-01-31T16:00:00.000Z", "2026-02-01"],
    ["year boundary", "2025-12-31T16:00:00.000Z", "2026-01-01"],
  ])("derives %s from the supplied business instant", (_label, instant, expected) => {
    expect(getTodayDateStr(new Date(instant))).toBe(expected);
  });

  it("returns Shanghai timezone date, not UTC date", () => {
    vi.useFakeTimers();
    // 2026-07-29 23:30 UTC = 2026-07-30 07:30 Shanghai
    vi.setSystemTime(new Date("2026-07-29T23:30:00Z"));
    expect(getTodayDateStr()).toBe("2026-07-30");
    vi.useRealTimers();
  });

  it("pads month and day to two digits", () => {
    vi.useFakeTimers();
    // 2026-01-05 00:00 UTC = 2026-01-05 08:00 Shanghai
    vi.setSystemTime(new Date("2026-01-05T00:00:00Z"));
    expect(getTodayDateStr()).toBe("2026-01-05");
    vi.useRealTimers();
  });
});

describe("calculateRelationshipDays", () => {
  it("counts UTC+8 midnight as the next relationship day from an injected instant", () => {
    expect(calculateRelationshipDays("2026-08-29", new Date("2026-08-29T16:00:00.000Z"))).toBe(2);
  });

  it("counts the start date as day 1", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-10-04T00:00:00+08:00"));
    expect(calculateRelationshipDays("2025-10-04")).toBe(1);
    vi.useRealTimers();
  });

  it("counts full days inclusive of the start date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-10-06T00:00:00+08:00"));
    expect(calculateRelationshipDays("2025-10-04")).toBe(3);
    vi.useRealTimers();
  });

  it("uses Shanghai timezone regardless of server timezone", () => {
    vi.useFakeTimers();
    // 2025-10-05 00:30 Shanghai = 2025-10-04 16:30 UTC
    vi.setSystemTime(new Date("2025-10-04T16:30:00Z"));
    expect(calculateRelationshipDays("2025-10-04")).toBe(2);
    vi.useRealTimers();
  });

  it("never returns negative", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-10-03T00:00:00+08:00"));
    expect(calculateRelationshipDays("2025-10-04")).toBe(0);
    vi.useRealTimers();
  });
});
