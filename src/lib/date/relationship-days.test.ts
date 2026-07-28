import { describe, expect, it, vi } from "vitest";
import { calculateRelationshipDays } from "./relationship-days";

describe("calculateRelationshipDays", () => {
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
