import { describe, expect, it } from "vitest";
import { validateSpaceName } from "./rules";

describe("profile preference rules", () => {
  it("accepts a shared site name from 1 to 40 characters", () => {
    expect(validateSpaceName(" 我们的小家 ")).toBe("我们的小家");
    expect(validateSpaceName("")).toBeNull();
    expect(validateSpaceName("家".repeat(41))).toBeNull();
  });
});
