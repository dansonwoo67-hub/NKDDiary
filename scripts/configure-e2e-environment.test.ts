import { describe, expect, it } from "vitest";
import { planSupabaseCliInvocation, selectE2eApiKeys } from "./configure-e2e-environment";

describe("E2E API key selection", () => {
  it("selects a modern publishable key and legacy service-role key", () => {
    expect(selectE2eApiKeys([
      { name: "anon", type: "legacy", api_key: "legacy-anon" },
      { name: "service_role", type: "legacy", api_key: "legacy-service" },
      { name: "default", type: "publishable", api_key: "modern-publishable" },
      { name: "default", type: "secret", api_key: "modern-secret" },
    ])).toEqual({
      publishableKey: "modern-publishable",
      serviceRoleKey: "legacy-service",
    });
  });

  it("rejects missing or disabled required key types", () => {
    expect(() => selectE2eApiKeys([
      { name: "service_role", type: "legacy", api_key: "disabled", disabled: true },
      { name: "default", type: "publishable", api_key: "publishable" },
    ])).toThrow("Active E2E publishable and service-role keys are required");
  });
});

describe("Supabase CLI invocation", () => {
  it("uses the Windows command processor for the npx shim", () => {
    expect(planSupabaseCliInvocation("win32", "C:\\Windows\\System32\\cmd.exe", ["projects", "list"])).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npx", "supabase@latest", "projects", "list"],
    });
  });
});
