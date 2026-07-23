import { describe, expect, it } from "vitest";
import { validateMoodInput } from "./rules";

describe("mood validation", () => {
  it("accepts short text, emoji, or both", () => {
    expect(validateMoodInput({ text: "想你了", emoji: "🥰" })).toEqual({ text: "想你了", emoji: "🥰" });
    expect(validateMoodInput({ text: "", emoji: "🌙" })).toEqual({ text: "", emoji: "🌙" });
  });

  it("rejects empty and overlong entries", () => {
    expect(validateMoodInput({ text: " ", emoji: " " })).toBeNull();
    expect(validateMoodInput({ text: "心".repeat(141), emoji: "" })).toBeNull();
  });
});
