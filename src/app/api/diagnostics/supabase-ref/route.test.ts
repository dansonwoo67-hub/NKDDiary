import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/diagnostics/supabase-ref", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only the Supabase project ref in Preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dhznooibxcnpioqwnicy.supabase.co");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      environment: "preview",
      supabaseProjectRef: "dhznooibxcnpioqwnicy",
    });
  });

  it("returns 404 in Production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dhznooibxcnpioqwnicy.supabase.co");

    expect((await GET()).status).toBe(404);
  });

  it.each([undefined, "not-a-url", "https://example.com", "https://bad_ref.supabase.co"])(
    "fails closed for missing or malformed Supabase URL: %s",
    async (supabaseUrl) => {
      vi.stubEnv("VERCEL_ENV", "preview");
      if (supabaseUrl === undefined) {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      } else {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
      }

      expect((await GET()).status).toBe(404);
    },
  );

  it("never exposes keys or unrelated environment values", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dhznooibxcnpioqwnicy.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-secret-marker");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret-marker");
    vi.stubEnv("UNRELATED_SECRET", "unrelated-secret-marker");

    const body = await (await GET()).text();

    expect(body).not.toContain("publishable-secret-marker");
    expect(body).not.toContain("service-role-secret-marker");
    expect(body).not.toContain("unrelated-secret-marker");
    expect(body).not.toContain("supabase.co");
  });
});
