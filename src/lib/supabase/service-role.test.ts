import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ kind: "service-role" })) }));

import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "./service-role";

describe("service-role Supabase client", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("fails closed when the private service-role key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "public-key-must-not-be-used");

    await expect(createServiceRoleSupabaseClient()).rejects.toThrow(
      "SUPABASE_SERVICE_ROLE_KEY is not configured",
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates a non-persistent client with only the private service-role key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-service-role-key");

    await createServiceRoleSupabaseClient();

    expect(createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "private-service-role-key",
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
  });
});
