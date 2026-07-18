const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImageValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export type DecodedLetterImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

export type ImageCompressionAdapter = {
  decode(file: File): Promise<DecodedLetterImage>;
  encode(
    decoded: DecodedLetterImage,
    width: number,
    height: number,
    quality: number,
  ): Promise<Blob | null>;
};

export type CompressedLetterImage = {
  file: File;
  width: number;
  height: number;
  sizeBytes: number;
};

export function validateLetterImage(file: File): ImageValidationResult {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, message: "仅支持 JPG、PNG 或 WebP 图片" };
  }
  if (file.size < 1) {
    return { ok: false, message: "图片内容为空" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "原图不能超过 5MB" };
  }
  return { ok: true };
}

const browserImageAdapter: ImageCompressionAdapter = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  },
  async encode(decoded, width, height, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // Intentionally do not paint a background: transparent PNGs retain alpha.
    context.drawImage(decoded.source, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  },
};

export async function compressLetterImage(
  file: File,
  maxEdge = 2000,
  quality = 0.82,
  adapter: ImageCompressionAdapter = browserImageAdapter,
): Promise<CompressedLetterImage> {
  const validation = validateLetterImage(file);
  if (!validation.ok) throw new Error(validation.message);
  if (!Number.isInteger(maxEdge) || maxEdge < 1) throw new Error("图片尺寸设置无效");
  if (!(quality > 0 && quality <= 1)) throw new Error("图片质量设置无效");

  let decoded: DecodedLetterImage;
  try {
    decoded = await adapter.decode(file);
  } catch {
    throw new Error("无法读取这张图片");
  }

  try {
    if (
      !Number.isFinite(decoded.width) ||
      !Number.isFinite(decoded.height) ||
      decoded.width <= 0 ||
      decoded.height <= 0
    ) {
      throw new Error("无法读取这张图片");
    }
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const blob = await adapter.encode(decoded, width, height, quality);
    if (!blob) throw new Error("图片压缩失败");
    if (blob.type.trim().toLowerCase() !== "image/webp") {
      throw new Error("当前浏览器不支持图片压缩，请换用最新版浏览器");
    }
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error("压缩后的图片仍超过 5MB");
    }
    if (blob.size < 1) throw new Error("图片压缩失败");

    const stem = file.name.replace(/\.[^.]+$/, "") || "letter-image";
    const output = new File([blob], `${stem}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
    return { file: output, width, height, sizeBytes: output.size };
  } finally {
    decoded.close?.();
  }
}
