import { describe, expect, it } from "vitest";
import { resolveMembership } from "./require-user";

describe("resolveMembership", () => {
  it("rejects authenticated users without an active couple membership", () => {
    expect(() => resolveMembership("user-3", [])).toThrow("鏃犳潈璁块棶杩欎釜绉佷汉绌洪棿");
  });

  it("returns the only active membership", () => {
    expect(resolveMembership("user-1", [{ user_id: "user-1", space_id: "space-1", active: true }])).toEqual({
      userId: "user-1",
      spaceId: "space-1",
    });
  });
});
