import { describe, expect, it } from "vitest";
import { BATCH2_E2E_PROJECT_REF } from "./e2e-environment-guard";
import {
  validateSeedEnvironment,
  validateSeedUserIds,
  validateSyntheticE2eEmail,
} from "./seed-couple-users";

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

describe("couple seed environment", () => {
  it("refuses to seed before the shared write-capable E2E guard passes", () => {
    expect(() => validateSeedEnvironment({
      E2E_TEST_ENV: "true",
      E2E_ALLOWED_SUPABASE_PROJECT_REF: BATCH2_E2E_PROJECT_REF,
      PRODUCTION_SUPABASE_PROJECT_REF: BATCH2_E2E_PROJECT_REF,
      NEXT_PUBLIC_SUPABASE_URL: `https://${BATCH2_E2E_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "test-secret",
    })).toThrow(/Refusing to run write-capable E2E against production Supabase/);
  });
});

describe("synthetic E2E account identity", () => {
  it("allows only clearly synthetic example.test E2E addresses", () => {
    expect(validateSyntheticE2eEmail("Susan-E2E-test@example.test")).toBe("susan-e2e-test@example.test");
    expect(() => validateSyntheticE2eEmail("susan@example.com")).toThrow("must be a synthetic E2E address");
    expect(() => validateSyntheticE2eEmail("susan@example.test")).toThrow("must be a synthetic E2E address");
  });
});
