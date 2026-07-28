import { describe, expect, it } from "vitest";
import {
  canInteract,
  countGraphemes,
  validateCommentBody,
} from "./rules";

describe("diary interaction rules", () => {
  it("does not allow either participant to interact with an unopened future diary", () => {
    const diary = { entryType: "future" as const, openedAt: null };

    expect(canInteract(diary, "recipient")).toBe(false);
    expect(canInteract(diary, "author")).toBe(false);
  });

  it("allows interactions after a future diary is explicitly opened", () => {
    expect(canInteract(
      { entryType: "future", openedAt: "2026-08-01T12:01:00Z" },
      "recipient",
    )).toBe(true);
  });

  it("allows interactions on today diaries", () => {
    expect(canInteract({ entryType: "today", openedAt: null }, "author")).toBe(true);
    expect(canInteract({ entryType: "today", openedAt: null }, "recipient")).toBe(true);
  });

  it("counts visible Unicode grapheme clusters", () => {
    expect(countGraphemes("👨‍👩‍👧‍👦好e\u0301")).toBe(3);
  });

  it("accepts 200 visible graphemes and rejects the 201st", () => {
    expect(validateCommentBody("❤️".repeat(200))).toEqual({
      ok: true,
      value: "❤️".repeat(200),
    });
    expect(validateCommentBody("❤️".repeat(201))).toEqual({
      ok: false,
      message: "评论不能超过 200 个字符。",
    });
  });

  it("rejects empty comments", () => {
    expect(validateCommentBody("  \n  ")).toEqual({
      ok: false,
      message: "评论不能为空。",
    });
  });
});
