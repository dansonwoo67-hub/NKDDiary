import { describe, expect, it } from "vitest";
import { canWithdrawLetter, validateSchedule } from "./lifecycle";

describe("letter lifecycle", () => {
  it("allows withdrawal before exactly 24 hours", () => {
    expect(canWithdrawLetter("2026-07-13T00:00:00Z", new Date("2026-07-13T23:59:59Z"))).toBe(true);
    expect(canWithdrawLetter("2026-07-13T00:00:00Z", new Date("2026-07-14T00:00:00Z"))).toBe(true);
    expect(canWithdrawLetter("2026-07-13T00:00:00Z", new Date("2026-07-14T00:00:01Z"))).toBe(false);
  });

  it("accepts future schedules and rejects past schedules", () => {
    expect(validateSchedule("time_capsule", "2026-07-14T08:30:00Z", new Date("2026-07-13T00:00:00Z"))).toEqual({ ok: true });
    expect(validateSchedule("time_capsule", "2026-07-12T08:30:00Z", new Date("2026-07-13T00:00:00Z")).ok).toBe(false);
  });

  it("rejects a later instant on the same Shanghai day", () => {
    const now = new Date("2026-07-13T00:00:00Z");

    expect(validateSchedule("time_capsule", "2026-07-13T10:00:00Z", now)).toEqual({
      ok: false,
      message: "请选择未来的日期和时间",
    });
  });

  it("accepts a true future Shanghai day across an explicit offset", () => {
    const now = new Date("2026-07-13T00:00:00Z");

    expect(validateSchedule("time_capsule", "2026-07-14T08:30:00-04:00", now)).toEqual({ ok: true });
    expect(validateSchedule("time_capsule", "2026-07-14T00:30:00+14:00", now).ok).toBe(false);
  });

  it("rejects malformed time capsule schedules", () => {
    expect(validateSchedule("time_capsule", "not-a-timestamp", new Date("2026-07-13T00:00:00Z"))).toEqual({
      ok: false,
      message: "请选择未来的日期和时间",
    });
  });

  it("enforces schedule boundaries by letter kind", () => {
    const now = new Date("2026-07-13T00:00:00Z");

    expect(validateSchedule("daily", null, now)).toEqual({ ok: true });
    expect(validateSchedule("daily", "2026-07-14T00:00:00Z", now)).toEqual({ ok: false, message: "今日日记不能预约发布" });
    expect(validateSchedule("time_capsule", null, now)).toEqual({ ok: false, message: "请选择未来的日期和时间" });
    expect(validateSchedule("time_capsule", "2026-07-13T00:00:00Z", now)).toEqual({ ok: false, message: "请选择未来的日期和时间" });
  });
});
