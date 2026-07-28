import { describe, expect, it } from "vitest";
import { validateSeedUserIds } from "./seed-couple-users";

describe("couple seed user IDs", () => {
  it("accepts two distinct UUIDs", () => {
    expect(
      validateSeedUserIds(
        "00000000-0000-4000-8000-00000000000a",
        "00000000-0000-4000-8000-00000000000b",
      ),
    ).toEqual([
      "00000000-0000-4000-8000-00000000000a",
      "00000000-0000-4000-8000-00000000000b",
    ]);
  });

  it("rejects a missing or invalid UUID", () => {
    expect(() =>
      validateSeedUserIds(undefined, "00000000-0000-4000-8000-00000000000b"),
    ).toThrow("COUPLE_USER_A_ID must be a UUID");
    expect(() =>
      validateSeedUserIds("not-a-uuid", "00000000-0000-4000-8000-00000000000b"),
    ).toThrow("COUPLE_USER_A_ID must be a UUID");
  });

  it("rejects the same Auth user twice", () => {
    const userId = "00000000-0000-4000-8000-00000000000a";

    expect(() => validateSeedUserIds(userId, userId)).toThrow(
      "COUPLE_USER_A_ID and COUPLE_USER_B_ID must be distinct",
    );
    expect(() => validateSeedUserIds(userId.toUpperCase(), userId)).toThrow(
      "COUPLE_USER_A_ID and COUPLE_USER_B_ID must be distinct",
    );
  });
});
