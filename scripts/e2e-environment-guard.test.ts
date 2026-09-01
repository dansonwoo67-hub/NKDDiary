import { describe, expect, it } from "vitest";
import {
  BATCH2_E2E_PROJECT_REF,
  assertWriteCapableE2eEnvironment,
  parseSupabaseProjectRef,
} from "./e2e-environment-guard";

const productionRef = "productionprojectref";

function validEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    E2E_TEST_ENV: "true",
    E2E_ALLOWED_SUPABASE_PROJECT_REF: BATCH2_E2E_PROJECT_REF,
    PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${BATCH2_E2E_PROJECT_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
    COUPLE_USER_A_EMAIL: "susan-e2e@example.test",
    COUPLE_USER_A_PASSWORD: "test-password-a",
    COUPLE_USER_B_EMAIL: "niki-e2e@example.test",
    COUPLE_USER_B_PASSWORD: "test-password-b",
    ...overrides,
  };
}

describe("write-capable E2E environment guard", () => {
  it("allows the fixed isolated Batch 2 Supabase project", () => {
    expect(assertWriteCapableE2eEnvironment(validEnvironment())).toEqual({
      projectRef: BATCH2_E2E_PROJECT_REF,
      production: false,
    });
  });

  it("rejects a Production Supabase URL", () => {
    expect(() => assertWriteCapableE2eEnvironment(validEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
    }))).toThrow(/Refusing to run write-capable E2E against production Supabase/);
  });

  it("rejects a missing explicit test flag", () => {
    expect(() => assertWriteCapableE2eEnvironment(validEnvironment({ E2E_TEST_ENV: undefined }))).toThrow();
  });

  it("rejects Production even when the test flag is true", () => {
    expect(() => assertWriteCapableE2eEnvironment(validEnvironment({
      E2E_TEST_ENV: "true",
      E2E_ALLOWED_SUPABASE_PROJECT_REF: productionRef,
      NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
    }))).toThrow();
  });

  it("rejects a project ref that differs from the allowlist", () => {
    expect(() => assertWriteCapableE2eEnvironment(validEnvironment({
      E2E_ALLOWED_SUPABASE_PROJECT_REF: "another-test-project",
    }))).toThrow();
  });

  it("rejects an unparseable Supabase project URL", () => {
    expect(parseSupabaseProjectRef("https://example.test/not-supabase")).toBeNull();
    expect(() => assertWriteCapableE2eEnvironment(validEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.test/not-supabase",
    }))).toThrow();
  });

  it("rejects a missing service role credential", () => {
    expect(() => assertWriteCapableE2eEnvironment(validEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    }))).toThrow();
  });

  it("rejects an allowlist and Production denylist conflict", () => {
    expect(() => assertWriteCapableE2eEnvironment(validEnvironment({
      PRODUCTION_SUPABASE_PROJECT_REF: BATCH2_E2E_PROJECT_REF,
    }))).toThrow();
  });
});
