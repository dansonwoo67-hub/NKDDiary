import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

import { GET } from "./route";

function supabaseResult(options?: {
  asset?: { storage_path: string } | null;
  signedUrl?: string | null;
  userId?: string | null;
}) {
  const maybeSingle = vi.fn(async () => ({
    data: options?.asset === undefined ? { storage_path: "user/letter/file.webp" } : options.asset,
    error: null,
  }));
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const createSignedUrl = vi.fn(async () => ({
    data:
      options?.signedUrl === null
        ? null
        : { signedUrl: options?.signedUrl ?? "https://project.supabase.co/storage/signed" },
    error: null,
  }));
  const getClaims = vi.fn(async () => ({
    data: options?.userId === null ? null : { claims: { sub: options?.userId ?? "viewer" } },
    error: null,
  }));
  return {
    client: {
      auth: { getClaims },
      from: vi.fn(() => query),
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    },
    query,
    createSignedUrl,
    getClaims,
  };
}

describe("GET /api/letter-assets/[assetId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("redirects an authorized viewer to a short-lived private URL without caching it", async () => {
    const supabase = supabaseResult();
    mocks.createServerSupabaseClient.mockResolvedValue(supabase.client);

    const response = await GET(new Request("http://localhost/api/letter-assets/x"), {
      params: Promise.resolve({ assetId: ASSET_ID }),
    });

    expect(supabase.getClaims).toHaveBeenCalledOnce();
    expect(supabase.query.eq).toHaveBeenCalledWith("id", ASSET_ID);
    expect(supabase.query.eq).toHaveBeenCalledWith("upload_status", "ready");
    expect(supabase.createSignedUrl).toHaveBeenCalledWith("user/letter/file.webp", 60);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://project.supabase.co/storage/signed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns a non-cacheable 404 instead of redirecting an unauthenticated request", async () => {
    const supabase = supabaseResult({ userId: null });
    mocks.createServerSupabaseClient.mockResolvedValue(supabase.client);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ assetId: ASSET_ID }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses a signed redirect that points outside the configured Supabase origin", async () => {
    const supabase = supabaseResult({ signedUrl: "https://evil.example/collect" });
    mocks.createServerSupabaseClient.mockResolvedValue(supabase.client);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ assetId: ASSET_ID }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    ["invalid id", "not-a-uuid", undefined],
    ["invisible asset", ASSET_ID, { asset: null }],
    ["signing failure", ASSET_ID, { signedUrl: null }],
  ])("returns a non-cacheable 404 for %s", async (_label, assetId, options) => {
    const supabase = supabaseResult(options);
    mocks.createServerSupabaseClient.mockResolvedValue(supabase.client);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ assetId }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
