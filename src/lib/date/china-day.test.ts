import { describe, expect, it } from "vitest";
import { getChinaDateString } from "./china-day";

describe("getChinaDateString", () => {
  it.each([
    ["UTC+8 midnight", "2026-08-29T16:00:00.000Z", "2026-08-30"],
    ["UTC+8 end of day", "2026-08-30T15:59:59.999Z", "2026-08-30"],
    ["month boundary", "2026-01-31T16:00:00.000Z", "2026-02-01"],
    ["year boundary", "2025-12-31T16:00:00.000Z", "2026-01-01"],
  ])("uses the relationship business date at %s", (_label, instant, expected) => {
    expect(getChinaDateString(new Date(instant))).toBe(expected);
  });
});
