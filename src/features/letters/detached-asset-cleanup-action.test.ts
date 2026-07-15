import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createGateway: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("./detached-asset-cleanup", () => ({
  createDetachedAssetCleanupGateway: mocks.createGateway,
  cleanupDetachedLetterAssets: mocks.cleanup,
}));

import { cleanupDetachedLetterAssetsAction } from "./detached-asset-cleanup-action";

describe("cleanupDetachedLetterAssetsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "user-id" });
    mocks.createServerSupabaseClient.mockResolvedValue({ client: true });
    mocks.createGateway.mockReturnValue({ gateway: true });
    mocks.cleanup.mockResolvedValue({ ok: true });
  });

  it("authenticates and delegates owner-only tombstone cleanup", async () => {
    await expect(cleanupDetachedLetterAssetsAction()).resolves.toEqual({ ok: true });
    expect(mocks.createGateway).toHaveBeenCalledWith({ client: true });
    expect(mocks.cleanup).toHaveBeenCalledWith({ gateway: true }, "user-id");
  });
});
