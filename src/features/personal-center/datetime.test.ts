import { describe, expect, it } from "vitest";
import { formatShanghaiDateTimeLocal, shanghaiInputToIso } from "./datetime";

describe("personal center datetime helpers", () => {
  it("formats a UTC timestamptz as Shanghai datetime-local", () => {
    expect(formatShanghaiDateTimeLocal("2026-07-31T16:30:00+00:00")).toBe("2026-08-01T00:30");
  });

  it("formats an offset timestamptz as Shanghai datetime-local", () => {
    expect(formatShanghaiDateTimeLocal("2026-08-01T08:30:00+08:00")).toBe("2026-08-01T08:30");
  });

  it("submits datetime-local values with an explicit Shanghai offset", () => {
    expect(shanghaiInputToIso("2026-08-01T08:30")).toBe("2026-08-01T08:30:00+08:00");
  });
});
