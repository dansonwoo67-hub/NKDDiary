import { describe, expect, it } from "vitest";
import { isPublicRoute } from "./proxy";

describe("isPublicRoute", () => {
  it("treats only the exact login path as public", () => {
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/login-anything")).toBe(false);
  });

  it("allows the exact Preview diagnostic path through to its fail-closed handler", () => {
    expect(isPublicRoute("/api/diagnostics/supabase-ref")).toBe(true);
    expect(isPublicRoute("/api/diagnostics/supabase-ref/extra")).toBe(false);
  });
});
