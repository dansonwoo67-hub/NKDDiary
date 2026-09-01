import { describe, expect, it } from "vitest";
import {
  compareRelationshipDates,
  formatRelationshipDate,
  formatRelationshipDateTime,
  getTodayInRelationshipTimezone,
  toRelationshipDate,
} from "./relationship-date";

describe("relationship date domain", () => {
  it.each([
    ["2026-08-28T16:01:00.000Z", "2026-08-29"],
    ["2026-08-29T15:59:00.000Z", "2026-08-29"],
    ["2026-01-31T16:01:00.000Z", "2026-02-01"],
    ["2025-12-31T16:01:00.000Z", "2026-01-01"],
  ])("interprets %s as UTC+8 business date %s", (instant, expected) => {
    expect(toRelationshipDate(new Date(instant))).toBe(expected);
  });

  it("derives today from an injected instant", () => {
    expect(getTodayInRelationshipTimezone(new Date("2026-08-29T16:00:00Z"))).toBe("2026-08-30");
  });

  it("formats dates and instants in the relationship timezone", () => {
    expect(formatRelationshipDate("2026-08-29")).toBe("2026年8月29日");
    expect(formatRelationshipDateTime("2026-08-29T16:01:00Z")).toBe("2026年8月30日 00:01");
  });

  it("compares calendar dates without applying the runtime timezone", () => {
    expect(compareRelationshipDates("2026-08-29", "2026-08-30")).toBe(-1);
    expect(compareRelationshipDates("2026-08-30", "2026-08-29")).toBe(1);
    expect(compareRelationshipDates("2026-08-29", "2026-08-29")).toBe(0);
  });
});
