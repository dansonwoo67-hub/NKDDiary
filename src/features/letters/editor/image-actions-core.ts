import { z } from "zod";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const createInputSchema = z.object({
  letterId: z.uuid(),
  mimeType: z.literal("image/webp"),
  width: z.number().int().min(1).max(2000),
  height: z.number().int().min(1).max(2000),
  sizeBytes: z.number().int().min(1).max(MAX_IMAGE_BYTES),
});

const completeInputSchema = z.object({
  assetId: z.uuid(),
  path: z.string().min(1).max(512),
});

export type CreateLetterImageInput = z.input<typeof createInputSchema>;
export type CompleteLetterImageInput = z.input<typeof completeInputSchema>;

export type LetterImageAsset = {
  id: string;
  letterId: string | null;
  ownerId: string;
  storagePath: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  uploadStatus: string;
};

export type LetterImageGateway = {
  findActiveLetter(
    letterId: string,
    userId: string,
    allowPublished?: boolean,
  ): Promise<{ id: string } | null>;
  insertUploadingAsset(input: {
    letterId: string;
    ownerId: string;
    storagePath: string;
    mimeType: "image/webp";
    width: number;
    height: number;
    sizeBytes: number;
  }): Promise<{ id: string } | null>;
  markAssetFailed(assetId: string, userId: string, path: string): Promise<boolean>;
  findOwnedAsset(assetId: string, userId: string): Promise<LetterImageAsset | null>;
  findStorageObject(path: string): Promise<{
    name: string;
    sizeBytes: number | null;
    mimeType: string | null;
  } | null>;
  markAssetReady(assetId: string, userId: string, path: string): Promise<boolean>;
  removeStorageObject(path: string): Promise<void>;
};

export type LetterImageActionResult =
  | { ok: true; assetId: string; path: string }
  | { ok: true; assetId: string; src: string }
  | { ok: true; assetId: string }
  | {
      ok: false;
      code:
        | "VALIDATION_ERROR"
        | "LETTER_LOCKED"
        | "NOT_FOUND"
        | "UPLOAD_ERROR"
        | "PENDING_CONFIRMATION"
        | "CLEANED";
      message: string;
    };

async function bestEffortFailAndClean(
  gateway: LetterImageGateway,
  assetId: string,
  userId: string,
  storagePath: string,
) {
  let failed = false;
  try {
    failed = await gateway.markAssetFailed(assetId, userId, storagePath);
  } catch {
    // Cleanup is best effort; the stale row remains inaccessible to recipients.
  }
  if (!failed) return;
  try {
    await gateway.removeStorageObject(storagePath);
  } catch {
    // Storage may never have received an object, or may be temporarily offline.
  }
}

export async function createLetterImageUpload(
  gateway: LetterImageGateway,
  userId: string,
  input: CreateLetterImageInput,
  uuid: () => string = () => globalThis.crypto.randomUUID(),
): Promise<LetterImageActionResult> {
  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "图片信息无效" };
  }
  const activeLetter = await gateway.findActiveLetter(parsed.data.letterId, userId);
  if (!activeLetter) {
    return { ok: false, code: "LETTER_LOCKED", message: "这封信现在不能添加图片" };
  }

  const path = `${userId}/${parsed.data.letterId}/${uuid()}.webp`;
  const asset = await gateway.insertUploadingAsset({
    letterId: parsed.data.letterId,
    ownerId: userId,
    storagePath: path,
    mimeType: "image/webp",
    width: parsed.data.width,
    height: parsed.data.height,
    sizeBytes: parsed.data.sizeBytes,
  });
  if (!asset) {
    return { ok: false, code: "UPLOAD_ERROR", message: "暂时无法准备图片上传" };
  }

  return { ok: true, assetId: asset.id, path };
}

async function failAndClean(
  gateway: LetterImageGateway,
  asset: LetterImageAsset,
  userId: string,
  code: "LETTER_LOCKED" | "UPLOAD_ERROR",
  message: string,
): Promise<LetterImageActionResult> {
  await bestEffortFailAndClean(gateway, asset.id, userId, asset.storagePath);
  return { ok: false, code, message };
}

export async function completeLetterImageUpload(
  gateway: LetterImageGateway,
  userId: string,
  input: CompleteLetterImageInput,
): Promise<LetterImageActionResult> {
  const parsed = completeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "图片信息无效" };
  }
  const asset = await gateway.findOwnedAsset(parsed.data.assetId, userId);
  if (
    asset?.uploadStatus === "failed" &&
    asset.storagePath === parsed.data.path
  ) {
    try {
      await gateway.removeStorageObject(asset.storagePath);
      return { ok: false, code: "CLEANED", message: "图片已随信件删除" };
    } catch {
      // The retained tombstone keeps a late object discoverable for later cleanup.
    }
    return { ok: false, code: "NOT_FOUND", message: "图片已随信件删除" };
  }
  if (
    !asset ||
    (asset.uploadStatus !== "uploading" && asset.uploadStatus !== "ready")
  ) {
    return { ok: false, code: "NOT_FOUND", message: "没有找到待完成的图片" };
  }
  if (asset.storagePath !== parsed.data.path) {
    return asset.uploadStatus === "uploading"
      ? failAndClean(gateway, asset, userId, "UPLOAD_ERROR", "图片路径校验失败")
      : { ok: false, code: "UPLOAD_ERROR", message: "图片路径校验失败" };
  }
  if (!asset.letterId) {
    return { ok: false, code: "NOT_FOUND", message: "图片已随信件删除" };
  }
  const activeLetter = asset.uploadStatus === "ready"
    ? await gateway.findActiveLetter(asset.letterId, userId, true)
    : await gateway.findActiveLetter(asset.letterId, userId);
  if (!activeLetter) {
    return asset.uploadStatus === "uploading"
      ? failAndClean(gateway, asset, userId, "LETTER_LOCKED", "这封信现在不能添加图片")
      : { ok: false, code: "LETTER_LOCKED", message: "这封信现在不能确认图片" };
  }

  const object = await gateway.findStorageObject(asset.storagePath);
  if (
    !object ||
    object.sizeBytes !== asset.sizeBytes ||
    object.mimeType !== asset.mimeType
  ) {
    return asset.uploadStatus === "uploading"
      ? failAndClean(gateway, asset, userId, "UPLOAD_ERROR", "上传的图片校验失败，请重试")
      : { ok: false, code: "UPLOAD_ERROR", message: "已完成图片的存储校验失败" };
  }
  const ready = await gateway.markAssetReady(asset.id, userId, asset.storagePath);
  if (!ready) {
    // The RPC may have committed `ready` even if its HTTP response was lost.
    // Never delete here; a repeat completion safely reconciles that outcome.
    return {
      ok: false,
      code: "PENDING_CONFIRMATION",
      message: "图片保存结果待确认，请重试",
    };
  }
  return { ok: true, assetId: asset.id, src: `/api/letter-assets/${asset.id}` };
}

export async function failLetterImageUpload(
  gateway: LetterImageGateway,
  userId: string,
  input: CompleteLetterImageInput,
): Promise<LetterImageActionResult> {
  const parsed = completeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "图片信息无效" };
  }
  const asset = await gateway.findOwnedAsset(parsed.data.assetId, userId);
  if (
    !asset ||
    (asset.uploadStatus !== "uploading" && asset.uploadStatus !== "failed") ||
    asset.storagePath !== parsed.data.path
  ) {
    return { ok: false, code: "NOT_FOUND", message: "没有找到待清理的图片" };
  }
  if (asset.uploadStatus === "failed") {
    try {
      await gateway.removeStorageObject(asset.storagePath);
      return { ok: true, assetId: asset.id };
    } catch {
      return { ok: false, code: "UPLOAD_ERROR", message: "图片清理尚未完成，请重试" };
    }
  }
  let failed = false;
  try {
    failed = await gateway.markAssetFailed(asset.id, userId, asset.storagePath);
  } catch {
    // A retry is safe because only `uploading` assets can transition to failed.
  }
  if (!failed) {
    return { ok: false, code: "NOT_FOUND", message: "没有找到待清理的图片" };
  }
  try {
    await gateway.removeStorageObject(asset.storagePath);
  } catch {
    return { ok: false, code: "UPLOAD_ERROR", message: "图片清理尚未完成，请重试" };
  }
  return { ok: true, assetId: asset.id };
}
