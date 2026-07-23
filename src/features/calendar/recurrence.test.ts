import { describe, expect, it } from "vitest";
import { getEventOccurrenceInMonth, getMostRecentOccurrence } from "./recurrence";

describe("recurrence", () => {
  it("uses the same day when the target month has that day", () => {
    expect(getEventOccurrenceInMonth("2026-01-30", "monthly", 2026, 7)).toBe("2026-07-30");
  });

  it("uses month end when the target month lacks that day", () => {
    expect(getEventOccurrenceInMonth("2026-01-30", "monthly", 2026, 2)).toBe("2026-02-28");
  });

  it("does not materialize recurring occurrences before the original event", () => {
    expect(getEventOccurrenceInMonth("2026-08-30", "monthly", 2026, 7)).toBeNull();
  });

  it("finds the latest monthly occurrence and clamps month end", () => {
    expect(getMostRecentOccurrence("2026-01-31", "monthly", "2026-04-29")).toBe("2026-03-31");
    expect(getMostRecentOccurrence("2026-01-31", "monthly", "2026-04-30")).toBe("2026-04-30");
  });

  it("clamps leap-day yearly recurrence and excludes future events", () => {
    expect(getMostRecentOccurrence("2024-02-29", "yearly", "2026-02-28")).toBe("2026-02-28");
    expect(getMostRecentOccurrence("2027-01-01", "none", "2026-12-31")).toBeNull();
  });
});
