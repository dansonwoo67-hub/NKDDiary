import { describe, expect, it } from "vitest";

import {
  MUTATION_OPT_IN,
  buildAppEnvironment,
  buildPlaywrightEnvironment,
  diffCreatedLetterIds,
  resolveMutationE2EConfig,
} from "./e2e-mutation-safety";

const dedicated = {
  E2E_ALLOW_MUTATIONS: MUTATION_OPT_IN,
  E2E_TEST_SUPABASE_URL: "https://test-only.supabase.co",
  E2E_TEST_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  E2E_TEST_SUPABASE_SECRET_KEY: "sb_secret_test",
  E2E_TEST_USER_A_EMAIL: "a@example.test",
  E2E_TEST_USER_A_PASSWORD: "a-password",
  E2E_TEST_USER_B_EMAIL: "b@example.test",
  E2E_TEST_USER_B_PASSWORD: "b-password",
  E2E_APP_SUPABASE_URL: "https://test-only.supabase.co/",
};

describe("E2E mutation safety", () => {
  it("keeps mutation tests disabled even when generic production-like variables exist", () => {
    expect(
      resolveMutationE2EConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co",
        SUPABASE_SECRET_KEY: "production-secret",
        COUPLE_USER_A_EMAIL: "real@example.com",
      }),
    ).toMatchObject({ enabled: false });
  });

  it("fails closed when explicit opt-in lacks any dedicated test setting", () => {
    expect(() =>
      resolveMutationE2EConfig({ E2E_ALLOW_MUTATIONS: MUTATION_OPT_IN }),
    ).toThrow(/E2E_TEST_SUPABASE_URL/);
  });

  it("requires the app backend to exactly match the dedicated test backend", () => {
    expect(() =>
      resolveMutationE2EConfig({
        ...dedicated,
        E2E_APP_SUPABASE_URL: "https://other.supabase.co",
      }),
    ).toThrow(/backend.*match/i);
  });

  it("enables mutations only with the strong opt-in and complete dedicated settings", () => {
    expect(resolveMutationE2EConfig(dedicated)).toMatchObject({
      enabled: true,
      supabaseUrl: "https://test-only.supabase.co",
      publishableKey: "sb_publishable_test",
      secretKey: "sb_secret_test",
      userA: { email: "a@example.test" },
      userB: { email: "b@example.test" },
    });
  });

  it("never sends generic or dedicated secrets into the Next.js app process", () => {
    const appEnv = buildAppEnvironment({
      PATH: "bin",
      NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "prod-public",
      SUPABASE_SECRET_KEY: "prod-secret",
      SUPABASE_SERVICE_ROLE_KEY: "prod-service-role",
      E2E_INSTANCE_TOKEN: "runner-only-token",
      E2E_TEST_SUPABASE_SECRET_KEY: "test-secret",
      E2E_TEST_USER_A_PASSWORD: "password",
    });

    expect(appEnv).toMatchObject({
      PATH: "bin",
      NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "prod-public",
      NEXT_TELEMETRY_DISABLED: "1",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      E2E_TEST_SUPABASE_SECRET_KEY: "",
      E2E_TEST_USER_A_PASSWORD: "",
    });
    expect(appEnv.E2E_INSTANCE_TOKEN).toBeUndefined();
  });

  it("overrides only public app settings for an explicitly enabled test backend", () => {
    const config = resolveMutationE2EConfig(dedicated);
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error("expected enabled config");
    const appEnv = buildAppEnvironment({ PATH: "bin", SUPABASE_SECRET_KEY: "never-pass" }, config);
    expect(appEnv).toMatchObject({
      PATH: "bin",
      NEXT_PUBLIC_SUPABASE_URL: "https://test-only.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      NEXT_TELEMETRY_DISABLED: "1",
      SUPABASE_SECRET_KEY: "",
      E2E_TEST_SUPABASE_SECRET_KEY: "",
    });
  });

  it("keeps the cleanup secret in the supervisor and out of Playwright/browser-facing env", () => {
    const config = resolveMutationE2EConfig(dedicated);
    if (!config.enabled) throw new Error("expected enabled config");
    const testEnv = buildPlaywrightEnvironment(
      {
        PATH: "bin",
        SUPABASE_SECRET_KEY: "generic",
        E2E_INSTANCE_TOKEN: "runner-only-token",
        E2E_TEST_SUPABASE_SECRET_KEY: "dedicated",
      },
      "http://127.0.0.1:3000",
      config,
    );
    expect(testEnv).toMatchObject({
      PATH: "bin",
      PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3000",
      E2E_ALLOW_MUTATIONS: MUTATION_OPT_IN,
      E2E_MUTATIONS_SUPERVISED: "1",
      E2E_TEST_USER_A_EMAIL: "a@example.test",
    });
    expect(testEnv.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(testEnv.E2E_INSTANCE_TOKEN).toBeUndefined();
    expect(testEnv.E2E_TEST_SUPABASE_SECRET_KEY).toBeUndefined();
    expect(testEnv.E2E_TEST_USER_A_PASSWORD).toBe("a-password");
  });

  it("selects only IDs created by the guarded test authors", () => {
    expect(
      diffCreatedLetterIds(
        [{ id: "before", author_id: "user-a" }],
        [
          { id: "before", author_id: "user-a" },
          { id: "created-a", author_id: "user-a" },
          { id: "created-b", author_id: "user-b" },
          { id: "unrelated", author_id: "other" },
        ],
        new Set(["user-a", "user-b"]),
      ),
    ).toEqual(["created-a", "created-b"]);
  });
});
