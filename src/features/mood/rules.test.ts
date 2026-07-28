import { describe, expect, it } from "vitest";
import { canAuthorMutate, countGraphemes, validateMoodInput } from "./rules";

describe("mood rules", () => {
  it("counts visible graphemes instead of UTF-16 code units", () => {
    expect(countGraphemes("❤️")).toBe(1);
    expect(countGraphemes("👩‍❤️‍👨")).toBe(1);
  });

  it("accepts one unified entry up to 15 graphemes", () => {
    expect(validateMoodInput(" 想你了🥰 ")).toEqual({ content: "想你了🥰" });
    expect(validateMoodInput("心".repeat(15))).toEqual({ content: "心".repeat(15) });
    expect(validateMoodInput("心".repeat(16))).toBeNull();
    expect(validateMoodInput("   ")).toBeNull();
  });

  it("locks author mutations at the 24-hour boundary", () => {
    const createdAt = "2026-07-25T08:00:00.000Z";
    expect(canAuthorMutate(createdAt, new Date("2026-07-26T07:59:59.000Z"))).toBe(true);
    expect(canAuthorMutate(createdAt, new Date("2026-07-26T08:00:00.000Z"))).toBe(false);
    expect(canAuthorMutate("invalid", new Date("2026-07-25T08:00:00.000Z"))).toBe(false);
  });
});
