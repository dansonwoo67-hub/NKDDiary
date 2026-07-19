import { describe, expect, it } from "vitest";
import { deriveFutureState, getChinaDate } from "./domain";

describe("future diary domain", () => {
  it("uses the Shanghai calendar date", () => {
    expect(getChinaDate(new Date("2026-07-19T16:30:00Z"))).toBe("2026-07-20");
  });

  it("requires an explicit open after the scheduled time", () => {
    const entry = { openAt: "2026-08-01T12:00:00Z", openedAt: null };

    expect(deriveFutureState(entry, new Date("2026-08-01T11:59:59Z"))).toBe("waiting");
    expect(deriveFutureState(entry, new Date("2026-08-01T12:00:00Z"))).toBe("ready");
  });
});
