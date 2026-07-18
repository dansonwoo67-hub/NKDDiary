import { describe, expect, it } from "vitest";
import { isPublicRoute } from "./proxy";

describe("isPublicRoute", () => {
  it("treats only the exact login path as public", () => {
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/login-anything")).toBe(false);
  });
});
