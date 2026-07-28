import { describe, expect, it } from "vitest";
import {
  browserContextOptionsFromProjectUse,
  fetchExpectedLoginReadiness,
  hasChildExited,
  integrationEnvironmentMissing,
  isExpectedLoginReadiness,
  parseEnvFile,
  planTreeTermination,
  RESPONSIVE_VIEWPORTS,
} from "./playwright-e2e-config";

describe("Playwright E2E environment", () => {
  it("gates the exact mobile, tablet, and desktop release widths", () => {
    expect(RESPONSIVE_VIEWPORTS).toEqual({
      "mobile-375": { width: 375, height: 812 },
      "tablet-768": { width: 768, height: 1024 },
      "desktop-1440": { width: 1440, height: 900 },
    });
  });

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

  it("keeps only browser-context options from a Playwright project", () => {
    expect(browserContextOptionsFromProjectUse({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
      userAgent: "mobile-agent",
      trace: "on-first-retry",
      baseURL: "http://127.0.0.1:3000",
    })).toEqual({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
      userAgent: "mobile-agent",
    });
  });

  it("accepts readiness only for the application's successful login page", () => {
    expect(isExpectedLoginReadiness(200, "<p>NKD DIARY</p>")).toBe(true);
    expect(isExpectedLoginReadiness(404, "<p>NKD DIARY</p>")).toBe(false);
    expect(isExpectedLoginReadiness(200, "unrelated server")).toBe(false);
  });

  it("treats either exit code or signal code as a completed child", () => {
    expect(hasChildExited({ exitCode: null, signalCode: null })).toBe(false);
    expect(hasChildExited({ exitCode: 0, signalCode: null })).toBe(true);
    expect(hasChildExited({ exitCode: null, signalCode: "SIGTERM" })).toBe(true);
  });

  it("keeps the readiness deadline active while reading the login body", async () => {
    const fetcher = async (_url: string, init?: { signal?: AbortSignal }) => ({
      status: 200,
      text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    });

    await expect(fetchExpectedLoginReadiness(fetcher, "http://example.test/login", 10)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("plans bounded Unix process-group gentle and forced termination", () => {
    expect(planTreeTermination("linux", 123, false, false)).toEqual({
      kind: "unix-group",
      pid: -123,
      signal: "SIGTERM",
      timeoutMs: 5_000,
    });
    expect(planTreeTermination("darwin", 123, true, false)).toEqual({
      kind: "unix-group",
      pid: -123,
      signal: "SIGKILL",
      timeoutMs: 5_000,
    });
  });

  it("plans bounded Windows taskkill phases and skips already-exited children", () => {
    expect(planTreeTermination("win32", 456, false, false)).toEqual({
      kind: "windows-taskkill",
      args: ["/pid", "456", "/T"],
      timeoutMs: 5_000,
    });
    expect(planTreeTermination("win32", 456, true, false)).toEqual({
      kind: "windows-taskkill",
      args: ["/pid", "456", "/T", "/F"],
      timeoutMs: 5_000,
    });
    expect(planTreeTermination("win32", 456, false, true)).toEqual({ kind: "none" });
  });
});
