import { describe, expect, it, vi } from "vitest";

import {
  completeLetterImageUpload,
  createLetterImageUpload,
  failLetterImageUpload,
  type LetterImageGateway,
} from "./image-actions-core";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LETTER_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const FILE_ID = "44444444-4444-4444-8444-444444444444";

function gateway(overrides: Partial<LetterImageGateway> = {}): LetterImageGateway {
  return {
    findActiveLetter: vi.fn(async () => ({ id: LETTER_ID })),
    insertUploadingAsset: vi.fn(async () => ({ id: ASSET_ID })),
    markAssetFailed: vi.fn(async () => true),
    findOwnedAsset: vi.fn(async () => ({
      id: ASSET_ID,
      letterId: LETTER_ID,
      ownerId: USER_ID,
      storagePath: `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`,
      mimeType: "image/webp",
      width: 1200,
      height: 800,
      sizeBytes: 1234,
      uploadStatus: "uploading",
    })),
    findStorageObject: vi.fn(async () => ({ name: `${FILE_ID}.webp`, sizeBytes: 1234, mimeType: "image/webp" })),
    markAssetReady: vi.fn(async () => true),
    removeStorageObject: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("createLetterImageUpload", () => {
  it("creates an uploading asset and returns only its RLS-protected path", async () => {
    const deps = gateway();
    const result = await createLetterImageUpload(
      deps,
      USER_ID,
      { letterId: LETTER_ID, mimeType: "image/webp", width: 1200, height: 800, sizeBytes: 1234 },
      () => FILE_ID,
    );

    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    expect(deps.findActiveLetter).toHaveBeenCalledWith(LETTER_ID, USER_ID);
    expect(deps.insertUploadingAsset).toHaveBeenCalledWith({
      letterId: LETTER_ID,
      ownerId: USER_ID,
      storagePath: path,
      mimeType: "image/webp",
      width: 1200,
      height: 800,
      sizeBytes: 1234,
    });
    expect(result).toEqual({ ok: true, assetId: ASSET_ID, path });
  });

  it.each([
    [{ letterId: "bad", mimeType: "image/webp", width: 1, height: 1, sizeBytes: 1 }],
    [{ letterId: LETTER_ID, mimeType: "image/png", width: 1, height: 1, sizeBytes: 1 }],
    [{ letterId: LETTER_ID, mimeType: "image/webp", width: 0, height: 1, sizeBytes: 1 }],
    [{ letterId: LETTER_ID, mimeType: "image/webp", width: 1, height: 1, sizeBytes: 5 * 1024 * 1024 + 1 }],
  ])("rejects invalid upload metadata without touching storage", async (input) => {
    const deps = gateway();
    const result = await createLetterImageUpload(deps, USER_ID, input as never, () => FILE_ID);
    expect(result.ok).toBe(false);
    expect(deps.insertUploadingAsset).not.toHaveBeenCalled();
  });

  it("returns an upload error when the uploading asset cannot be created", async () => {
    const deps = gateway({ insertUploadingAsset: vi.fn(async () => null) });
    const result = await createLetterImageUpload(
      deps,
      USER_ID,
      { letterId: LETTER_ID, mimeType: "image/webp", width: 10, height: 10, sizeBytes: 10 },
      () => FILE_ID,
    );
    expect(result).toMatchObject({ ok: false, code: "UPLOAD_ERROR" });
    expect(deps.markAssetFailed).not.toHaveBeenCalled();
    expect(deps.removeStorageObject).not.toHaveBeenCalled();
  });

  it("does not create an asset for someone else's or sealed letter", async () => {
    const deps = gateway({ findActiveLetter: vi.fn(async () => null) });
    const result = await createLetterImageUpload(
      deps,
      USER_ID,
      { letterId: LETTER_ID, mimeType: "image/webp", width: 10, height: 10, sizeBytes: 10 },
      () => FILE_ID,
    );
    expect(result).toMatchObject({ ok: false, code: "LETTER_LOCKED" });
    expect(deps.insertUploadingAsset).not.toHaveBeenCalled();
  });
});

describe("failLetterImageUpload", () => {
  it("marks and removes an owned upload even when its parent published first", async () => {
    const deps = gateway({ findActiveLetter: vi.fn(async () => null) });
    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const result = await failLetterImageUpload(deps, USER_ID, { assetId: ASSET_ID, path });
    expect(result).toEqual({ ok: true, assetId: ASSET_ID });
    expect(deps.markAssetFailed).toHaveBeenCalledWith(ASSET_ID, USER_ID, path);
    expect(deps.removeStorageObject).toHaveBeenCalledWith(path);
    expect(deps.markAssetReady).not.toHaveBeenCalled();
    expect(deps.findActiveLetter).not.toHaveBeenCalled();
  });

  it("never removes an object when the controlled failure transition loses a race to ready", async () => {
    const deps = gateway({ markAssetFailed: vi.fn(async () => false) });
    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const result = await failLetterImageUpload(deps, USER_ID, {
      assetId: ASSET_ID,
      path,
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(deps.removeStorageObject).not.toHaveBeenCalled();
  });

  it("cleans an owned failed tombstone even after its parent letter is gone", async () => {
    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const deps = gateway({
      findActiveLetter: vi.fn(async () => null),
      findOwnedAsset: vi.fn(async () => ({
        id: ASSET_ID,
        letterId: null,
        ownerId: USER_ID,
        storagePath: path,
        mimeType: "image/webp",
        width: 1200,
        height: 800,
        sizeBytes: 1234,
        uploadStatus: "failed",
      })),
    });

    const result = await failLetterImageUpload(deps, USER_ID, {
      assetId: ASSET_ID,
      path,
    });

    expect(result).toEqual({ ok: true, assetId: ASSET_ID });
    expect(deps.findActiveLetter).not.toHaveBeenCalled();
    expect(deps.markAssetFailed).not.toHaveBeenCalled();
    expect(deps.removeStorageObject).toHaveBeenCalledWith(path);
  });
});

describe("completeLetterImageUpload", () => {
  it("cleans a detached failed asset without ever attempting ready", async () => {
    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const deps = gateway({
      findOwnedAsset: vi.fn(async () => ({
        id: ASSET_ID,
        letterId: null,
        ownerId: USER_ID,
        storagePath: path,
        mimeType: "image/webp",
        width: 1200,
        height: 800,
        sizeBytes: 1234,
        uploadStatus: "failed",
      })),
    });

    const result = await completeLetterImageUpload(deps, USER_ID, {
      assetId: ASSET_ID,
      path,
    });

    expect(result).toMatchObject({ ok: false, code: "CLEANED" });
    expect(deps.removeStorageObject).toHaveBeenCalledWith(path);
    expect(deps.markAssetReady).not.toHaveBeenCalled();
  });

  it("marks the caller's verified storage object ready", async () => {
    const deps = gateway();
    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const result = await completeLetterImageUpload(deps, USER_ID, { assetId: ASSET_ID, path });
    expect(deps.findOwnedAsset).toHaveBeenCalledWith(ASSET_ID, USER_ID);
    expect(deps.findActiveLetter).toHaveBeenCalledWith(LETTER_ID, USER_ID);
    expect(deps.findStorageObject).toHaveBeenCalledWith(path);
    expect(deps.markAssetReady).toHaveBeenCalledWith(ASSET_ID, USER_ID, path);
    expect(result).toEqual({ ok: true, assetId: ASSET_ID, src: `/api/letter-assets/${ASSET_ID}` });
  });

  it.each([
    ["path mismatch", { path: `${USER_ID}/${LETTER_ID}/55555555-5555-4555-8555-555555555555.webp` }],
    ["missing object", { object: null }],
    ["size mismatch", { object: { name: `${FILE_ID}.webp`, sizeBytes: 999, mimeType: "image/webp" } }],
    ["mime mismatch", { object: { name: `${FILE_ID}.webp`, sizeBytes: 1234, mimeType: "image/png" } }],
  ])("refuses completion on %s", async (_label, scenario) => {
    const path = "path" in scenario ? scenario.path! : `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const deps = gateway(
      "object" in scenario
        ? { findStorageObject: vi.fn(async () => scenario.object ?? null) }
        : {},
    );
    const result = await completeLetterImageUpload(deps, USER_ID, { assetId: ASSET_ID, path });
    expect(result.ok).toBe(false);
    expect(deps.markAssetReady).not.toHaveBeenCalled();
    expect(deps.markAssetFailed).toHaveBeenCalledWith(
      ASSET_ID,
      USER_ID,
      `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`,
    );
    expect(deps.removeStorageObject).toHaveBeenCalledWith(
      `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`,
    );
  });

  it("never lets an asset become ready after its parent is sealed", async () => {
    const deps = gateway({ findActiveLetter: vi.fn(async () => null) });
    const result = await completeLetterImageUpload(deps, USER_ID, {
      assetId: ASSET_ID,
      path: `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`,
    });
    expect(result).toMatchObject({ ok: false, code: "LETTER_LOCKED" });
    expect(deps.markAssetReady).not.toHaveBeenCalled();
  });

  it("confirms an already-ready asset after the scheduler publishes its parent", async () => {
    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const findActiveLetter = vi.fn(
      async (_letterId: string, _userId: string, allowPublished?: boolean) =>
        allowPublished ? { id: LETTER_ID } : null,
    );
    const deps = gateway({
      findActiveLetter,
      findOwnedAsset: vi.fn(async () => ({
        id: ASSET_ID,
        letterId: LETTER_ID,
        ownerId: USER_ID,
        storagePath: path,
        mimeType: "image/webp",
        width: 1200,
        height: 800,
        sizeBytes: 1234,
        uploadStatus: "ready",
      })),
    });

    const result = await completeLetterImageUpload(deps, USER_ID, {
      assetId: ASSET_ID,
      path,
    });

    expect(findActiveLetter).toHaveBeenCalledWith(LETTER_ID, USER_ID, true);
    expect(result).toEqual({
      ok: true,
      assetId: ASSET_ID,
      src: `/api/letter-assets/${ASSET_ID}`,
    });
    expect(deps.markAssetFailed).not.toHaveBeenCalled();
    expect(deps.removeStorageObject).not.toHaveBeenCalled();
  });

  it("never cleans an already-ready asset when its parent lookup is unavailable", async () => {
    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const deps = gateway({
      findActiveLetter: vi.fn(async () => null),
      findOwnedAsset: vi.fn(async () => ({
        id: ASSET_ID,
        letterId: LETTER_ID,
        ownerId: USER_ID,
        storagePath: path,
        mimeType: "image/webp",
        width: 1200,
        height: 800,
        sizeBytes: 1234,
        uploadStatus: "ready",
      })),
    });

    const result = await completeLetterImageUpload(deps, USER_ID, {
      assetId: ASSET_ID,
      path,
    });

    expect(result).toMatchObject({ ok: false, code: "LETTER_LOCKED" });
    expect(deps.markAssetFailed).not.toHaveBeenCalled();
    expect(deps.removeStorageObject).not.toHaveBeenCalled();
  });

  it("retries safely when ready committed but the first response was lost", async () => {
    const path = `${USER_ID}/${LETTER_ID}/${FILE_ID}.webp`;
    const first = gateway({ markAssetReady: vi.fn(async () => false) });
    const firstResult = await completeLetterImageUpload(first, USER_ID, {
      assetId: ASSET_ID,
      path,
    });
    expect(firstResult).toMatchObject({ ok: false, code: "PENDING_CONFIRMATION" });
    expect(first.markAssetFailed).not.toHaveBeenCalled();
    expect(first.removeStorageObject).not.toHaveBeenCalled();

    const second = gateway({
      findOwnedAsset: vi.fn(async () => ({
        id: ASSET_ID,
        letterId: LETTER_ID,
        ownerId: USER_ID,
        storagePath: path,
        mimeType: "image/webp",
        width: 1200,
        height: 800,
        sizeBytes: 1234,
        uploadStatus: "ready",
      })),
    });
    const secondResult = await completeLetterImageUpload(second, USER_ID, {
      assetId: ASSET_ID,
      path,
    });
    expect(secondResult).toEqual({
      ok: true,
      assetId: ASSET_ID,
      src: `/api/letter-assets/${ASSET_ID}`,
    });
    expect(second.markAssetFailed).not.toHaveBeenCalled();
    expect(second.removeStorageObject).not.toHaveBeenCalled();
  });
});
