import { describe, expect, it } from "vitest";
import { calculateEditableUntil, canEditLetter, validateOpenResponse, validateSevenCharLine } from "./rules";

describe("letter rules", () => {
  it("limits seven-character line to 7 characters", () => {
    expect(validateSevenCharLine("想你啦")).toBe("想你啦");
    expect(() => validateSevenCharLine("一二三四五六七八")).toThrow("最多7个字");
  });

  it("requires open response and limits it to 3 characters", () => {
    expect(validateOpenResponse("抱抱")).toBe("抱抱");
    expect(() => validateOpenResponse("抱抱你呀")).toThrow("最多3个字");
  });

  it("allows editing within 24 hours and locks after", () => {
    const submittedAt = new Date("2026-07-10T10:00:00+08:00");
    const editableUntil = calculateEditableUntil(submittedAt);

    expect(canEditLetter(new Date("2026-07-11T09:59:59+08:00"), editableUntil)).toBe(true);
    expect(canEditLetter(new Date("2026-07-11T10:00:00+08:00"), editableUntil)).toBe(true);
    expect(canEditLetter(new Date("2026-07-11T10:00:01+08:00"), editableUntil)).toBe(false);
  });
});
