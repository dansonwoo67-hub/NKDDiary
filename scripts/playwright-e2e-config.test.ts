import { describe, expect, it } from "vitest";
import {
  integrationEnvironmentMissing,
  parseEnvFile,
} from "./playwright-e2e-config";

describe("Playwright E2E environment", () => {
  it("parses quoted local environment values", () => {
    expect(parseEnvFile("# comment\nA='one'\nB=\"two\"\nC=three\nBAD\n")).toEqual({
      A: "one",
      B: "two",
      C: "three",
    });
  });

  it("reports every missing integration prerequisite without exposing values", () => {
    expect(integrationEnvironmentMissing({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      COUPLE_USER_A_EMAIL: "author@example.test",
    })).toEqual([
      "SUPABASE_SERVICE_ROLE_KEY",
      "COUPLE_USER_A_PASSWORD",
      "COUPLE_USER_B_EMAIL",
      "COUPLE_USER_B_PASSWORD",
    ]);
  });
});
