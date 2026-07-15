import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createLetterImageGateway: vi.fn(),
  createLetterImageUpload: vi.fn(),
  completeLetterImageUpload: vi.fn(),
  failLetterImageUpload: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("./image-supabase-gateway", () => ({
  createLetterImageGateway: mocks.createLetterImageGateway,
}));
vi.mock("./image-actions-core", () => ({
  createLetterImageUpload: mocks.createLetterImageUpload,
  completeLetterImageUpload: mocks.completeLetterImageUpload,
  failLetterImageUpload: mocks.failLetterImageUpload,
}));

import {
  completeLetterImageUploadAction,
  createLetterImageUploadAction,
  failLetterImageUploadAction,
} from "./image-actions";

describe("letter image server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "user-id" });
    mocks.createServerSupabaseClient.mockResolvedValue({ client: true });
    mocks.createLetterImageGateway.mockReturnValue({ gateway: true });
  });

  it("authenticates and creates only the uploading asset through the user-session client", async () => {
    const input = {
      letterId: "22222222-2222-4222-8222-222222222222",
      mimeType: "image/webp" as const,
      width: 100,
      height: 100,
      sizeBytes: 100,
    };
    mocks.createLetterImageUpload.mockResolvedValue({ ok: true });

    await createLetterImageUploadAction(input);

    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.createServerSupabaseClient).toHaveBeenCalledOnce();
    expect(mocks.createLetterImageGateway).toHaveBeenCalledWith({ client: true });
    expect(mocks.createLetterImageUpload).toHaveBeenCalledWith(
      { gateway: true },
      "user-id",
      input,
    );
  });

  it("authenticates completion instead of trusting a client-owned path", async () => {
    const input = {
      assetId: "33333333-3333-4333-8333-333333333333",
      path: "user/letter/file.webp",
    };
    mocks.completeLetterImageUpload.mockResolvedValue({ ok: true });

    await completeLetterImageUploadAction(input);

    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.completeLetterImageUpload).toHaveBeenCalledWith(
      { gateway: true },
      "user-id",
      input,
    );
  });

  it("uses the explicit failure action for client upload errors", async () => {
    const input = { assetId: "33333333-3333-4333-8333-333333333333", path: "user/letter/file.webp" };
    mocks.failLetterImageUpload.mockResolvedValue({ ok: true });
    await failLetterImageUploadAction(input);
    expect(mocks.failLetterImageUpload).toHaveBeenCalledWith(
      { gateway: true },
      "user-id",
      input,
    );
    expect(mocks.completeLetterImageUpload).not.toHaveBeenCalled();
  });
});
