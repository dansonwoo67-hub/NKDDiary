import { describe, expect, it, vi } from "vitest";

import {
  cleanupDetachedLetterAssets,
  createDetachedAssetCleanupGateway,
  type DetachedAssetCleanupGateway,
} from "./detached-asset-cleanup";

function gateway(overrides: Partial<DetachedAssetCleanupGateway> = {}) {
  return {
    listPaths: vi.fn(async () => ["user/letter/late.webp"]),
    removeObjects: vi.fn(async () => null),
    ...overrides,
  } satisfies DetachedAssetCleanupGateway;
}

describe("cleanupDetachedLetterAssets", () => {
  it("removes detached failed objects but keeps their metadata tombstones", async () => {
    const deps = gateway();
    await expect(cleanupDetachedLetterAssets(deps, "user-id")).resolves.toEqual({
      ok: true,
    });
    expect(deps.listPaths).toHaveBeenCalledWith("user-id");
    expect(deps.removeObjects).toHaveBeenCalledWith(["user/letter/late.webp"]);
  });

  it("keeps cleanup retryable when storage removal fails", async () => {
    const deps = gateway({ removeObjects: vi.fn(async () => "storage offline") });
    await expect(cleanupDetachedLetterAssets(deps, "user-id")).resolves.toEqual({
      ok: false,
    });
  });
});

describe("createDetachedAssetCleanupGateway", () => {
  it("queries all failed tombstones owned by the current user", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({
          data: [{ storage_path: "user/letter/late.webp" }],
          error: null,
        }).then(resolve);
      },
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    const remove = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn(() => query),
      storage: { from: vi.fn(() => ({ remove })) },
    };
    const deps = createDetachedAssetCleanupGateway(client as never);

    await expect(deps.listPaths("user-id")).resolves.toEqual([
      "user/letter/late.webp",
    ]);
    expect(query.eq).toHaveBeenCalledWith("owner_id", "user-id");
    expect(query.eq).toHaveBeenCalledWith("upload_status", "failed");
    expect(query.is).not.toHaveBeenCalled();

    await expect(deps.removeObjects(["user/letter/late.webp"])).resolves.toBeNull();
    expect(remove).toHaveBeenCalledWith(["user/letter/late.webp"]);
  });
});
