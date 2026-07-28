import { describe, expect, it } from "vitest";
import { getSettingsFeedback } from "./feedback";

describe("getSettingsFeedback", () => {
  it("prefers a local operation failure and otherwise returns the server action message", () => {
    expect(getSettingsFeedback("头像上传失败", [
      { ok: false, message: "空间名称修改失败" },
    ])).toBe("头像上传失败");

    expect(getSettingsFeedback("", [
      { ok: true, message: "" },
      { ok: false, message: "空间名称修改失败" },
    ])).toBe("空间名称修改失败");
  });

  it("returns no feedback for untouched action states", () => {
    expect(getSettingsFeedback("", [
      { ok: true, message: "" },
      { ok: true, message: "" },
    ])).toBe("");
  });
});
