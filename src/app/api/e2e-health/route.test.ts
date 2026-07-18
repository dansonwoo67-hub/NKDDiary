import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/e2e-health", () => {
  it("is unavailable and uncacheable without a runner instance token", async () => {
    vi.stubEnv("E2E_INSTANCE_TOKEN", "");

    const response = await GET();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports the instance token and actual public backend without caching", async () => {
    vi.stubEnv("E2E_INSTANCE_TOKEN", "unique-run-token");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      instanceToken: "unique-run-token",
      backendUrl: "https://test.supabase.co",
    });
  });
});
