import { describe, expect, it, vi } from "vitest";

import {
  deletePrivateLetterWithAssets,
  type PrivateLetterDeletionGateway,
} from "./private-letter-deletion";

const userId = "11111111-1111-4111-8111-111111111111";
const letterId = "22222222-2222-4222-8222-222222222222";
const deletionToken = "33333333-3333-4333-8333-333333333333";

function setup(overrides: Partial<PrivateLetterDeletionGateway> = {}) {
  const findOwnLetter = vi.fn(async () => ({
    id: letterId,
    status: "draft" as const,
    version: 3,
    deletionToken: null,
  }));
  const gateway: PrivateLetterDeletionGateway = {
    findOwnLetter,
    findDetachedPaths: vi.fn(async () => []),
    prepare: vi.fn(async () => ({
      token: deletionToken,
      paths: ["user/letter/one.webp", "user/letter/two.webp"],
    })),
    removeObjects: vi.fn(async () => null),
    finalize: vi.fn(async () => true),
    ...overrides,
  };
  return gateway;
}

describe("deletePrivateLetterWithAssets", () => {
  it("prepares, removes real storage objects, then finalizes the private letter", async () => {
    const gateway = setup();
    const result = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 3,
    });
    expect(gateway.prepare).toHaveBeenCalledWith(letterId, 3);
    expect(gateway.removeObjects).toHaveBeenCalledWith([
      "user/letter/one.webp",
      "user/letter/two.webp",
    ]);
    expect(gateway.finalize).toHaveBeenCalledWith(letterId, deletionToken);
    expect(result).toEqual({ ok: true, message: "私密信件已删除" });
  });

  it("deletes the parent while retaining tombstones when storage removal is offline", async () => {
    const gateway = setup({
      removeObjects: vi.fn(async () => "存储暂时不可用"),
    });
    const result = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 3,
    });

    expect(gateway.finalize).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, message: "私密信件已删除" });
  });

  it("resumes with the database deletion token after the first prepare response is lost", async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        token: deletionToken,
        paths: ["user/letter/one.webp"],
      });
    const gateway = setup({ prepare });

    const first = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 3,
    });
    expect(first).toMatchObject({ ok: false, code: "DATABASE_ERROR" });

    gateway.findOwnLetter = vi.fn(async () => ({
      id: letterId,
      status: "draft" as const,
      version: 4,
      deletionToken,
    }));

    const second = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 3,
    });
    expect(second.ok).toBe(true);
    expect(gateway.finalize).toHaveBeenCalledWith(letterId, deletionToken);
  });

  it("rejects a stale version before preparing any object", async () => {
    const gateway = setup();
    const result = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 2,
    });
    expect(result).toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
    expect(gateway.prepare).not.toHaveBeenCalled();
  });

  it("retries storage cleanup from retained tombstones after the parent is gone", async () => {
    const gateway = setup({
      findOwnLetter: vi.fn(async () => null),
      findDetachedPaths: vi.fn(async () => ["user/letter/late.webp"]),
    });

    const result = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 3,
    });

    expect(gateway.findDetachedPaths).toHaveBeenCalledWith(letterId, userId);
    expect(gateway.removeObjects).toHaveBeenCalledWith(["user/letter/late.webp"]);
    expect(gateway.prepare).not.toHaveBeenCalled();
    expect(gateway.finalize).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, message: "私密信件已删除" });
  });

  it("treats an already-missing parent with no images as an idempotent success", async () => {
    const gateway = setup({ findOwnLetter: vi.fn(async () => null) });

    const result = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 3,
    });

    expect(gateway.findDetachedPaths).toHaveBeenCalledWith(letterId, userId);
    expect(gateway.removeObjects).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, message: "私密信件已删除" });
  });

  it("keeps a detached tombstone retryable when cleanup throws", async () => {
    const gateway = setup({
      findOwnLetter: vi.fn(async () => null),
      findDetachedPaths: vi.fn(async () => ["user/letter/late.webp"]),
      removeObjects: vi.fn(async () => {
        throw new Error("storage offline");
      }),
    });

    const result = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 3,
    });

    expect(result).toMatchObject({ ok: false, code: "DATABASE_ERROR" });
  });

  it("treats a lost finalize response as success after confirming the parent is gone", async () => {
    const findOwnLetter = vi
      .fn()
      .mockResolvedValueOnce({
        id: letterId,
        status: "draft" as const,
        version: 3,
        deletionToken: null,
      })
      .mockResolvedValueOnce(null);
    const gateway = setup({
      findOwnLetter,
      finalize: vi.fn(async () => {
        throw new Error("response lost after commit");
      }),
    });

    const result = await deletePrivateLetterWithAssets(gateway, userId, {
      id: letterId,
      version: 3,
    });

    expect(findOwnLetter).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, message: "私密信件已删除" });
  });
});
