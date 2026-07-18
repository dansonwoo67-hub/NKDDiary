import { describe, expect, it } from "vitest";
import { resolveRecurringEventDate, resolveRecurringEventDateOnly } from "./recurrence";

describe("recurrence", () => {
  it("uses the same day when the target month has that day", () => {
    expect(resolveRecurringEventDate(new Date(2026, 0, 30), 2026, 6).getDate()).toBe(30);
  });

  it("uses month end when the target month lacks that day", () => {
    const resolved = resolveRecurringEventDate(new Date(2026, 0, 30), 2026, 1);

    expect(resolved.getFullYear()).toBe(2026);
    expect(resolved.getMonth()).toBe(1);
    expect(resolved.getDate()).toBe(28);
  });

  it("keeps date-only recurrence stable without a server timezone", () => {
    expect(resolveRecurringEventDateOnly("2026-07-01", 2026, 8)).toBe("2026-08-01");
    expect(resolveRecurringEventDateOnly("2024-02-29", 2025, 2)).toBe("2025-02-28");
  });
});
