import { describe, expect, it, vi } from "vitest";

import { createLetterImageGateway } from "./image-supabase-gateway";

describe("createLetterImageGateway", () => {
  it("allows published lookup only for idempotent confirmation and excludes pending deletion", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: { id: "letter-id" }, error: null })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.is.mockReturnValue(query);
    const gateway = createLetterImageGateway({
      from: vi.fn(() => query),
    } as never);

    await expect(
      gateway.findActiveLetter("letter-id", "user-id", true),
    ).resolves.toEqual({ id: "letter-id" });

    expect(query.in).toHaveBeenCalledWith("status", [
      "draft",
      "scheduled",
      "published",
    ]);
    expect(query.is).toHaveBeenCalledWith("deletion_token", null);
  });

  it("uses the metadata-verifying RPC instead of a direct ready update", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const from = vi.fn(() => {
      throw new Error("direct table update must not be used");
    });
    const gateway = createLetterImageGateway({ rpc, from } as never);

    await expect(
      gateway.markAssetReady("asset-id", "user-id", "user/letter/file.webp"),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("complete_letter_image_upload", {
      p_asset_id: "asset-id",
      p_storage_path: "user/letter/file.webp",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("uses the controlled failure RPC and requires its boolean confirmation", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const gateway = createLetterImageGateway({ rpc } as never);

    await expect(gateway.markAssetFailed("asset-id", "user-id", "user/letter/file.webp"))
      .resolves.toBe(true);
    await expect(gateway.markAssetFailed("asset-id", "user-id", "user/letter/file.webp"))
      .resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith("fail_letter_image_upload", {
      p_asset_id: "asset-id",
      p_storage_path: "user/letter/file.webp",
    });
  });

  it("relies on the database default so inserts cannot choose upload_status", async () => {
    const single = vi.fn(async () => ({ data: { id: "asset-id" }, error: null }));
    const select = vi.fn(() => ({ single }));
    const receivedPayloads: Record<string, unknown>[] = [];
    const insert = vi.fn((payload: Record<string, unknown>) => {
      receivedPayloads.push(payload);
      return { select };
    });
    const gateway = createLetterImageGateway({
      from: vi.fn(() => ({ insert })),
    } as never);

    await gateway.insertUploadingAsset({
      letterId: "letter-id",
      ownerId: "user-id",
      storagePath: "user/letter/file.webp",
      mimeType: "image/webp",
      width: 10,
      height: 10,
      sizeBytes: 100,
    });

    expect(insert).toHaveBeenCalledOnce();
    expect(receivedPayloads[0]).not.toHaveProperty("upload_status");
  });
});
