import { describe, expect, it } from "vitest";
import { assertLegacyCoupleMembership, resolveMembership } from "./require-user";

describe("assertLegacyCoupleMembership", () => {
  it("rejects users whose legacy membership marker is missing", () => {
    expect(() => assertLegacyCoupleMembership(undefined)).toThrow("无权访问这个私人空间");
  });

  it("rejects users whose legacy membership marker is false", () => {
    expect(() => assertLegacyCoupleMembership({ nkd_diary_member: "false" })).toThrow("无权访问这个私人空间");
  });

  it("accepts only the explicit legacy membership marker", () => {
    expect(() => assertLegacyCoupleMembership({ nkd_diary_member: "true" })).not.toThrow();
  });
});

describe("resolveMembership", () => {
  it("rejects authenticated users without an active couple membership", () => {
    expect(() => resolveMembership("user-3", [])).toThrow("无权访问这个私人空间");
  });

  it("returns the only active membership", () => {
    expect(resolveMembership("user-1", [{ user_id: "user-1", space_id: "space-1", active: true }])).toEqual({
      userId: "user-1",
      spaceId: "space-1",
    });
  });
});
