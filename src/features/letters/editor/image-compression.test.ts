import { describe, expect, it, vi } from "vitest";

import {
  compressLetterImage,
  validateLetterImage,
  type ImageCompressionAdapter,
} from "./image-compression";

function fileOf(size: number, name = "photo.jpg", type = "image/jpeg") {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateLetterImage", () => {
  it.each([
    ["photo.gif", "image/gif"],
    ["photo.svg", "image/svg+xml"],
    ["photo.heic", "image/heic"],
  ])("rejects unsupported %s images", (name, type) => {
    expect(validateLetterImage(fileOf(1, name, type))).toEqual({
      ok: false,
      message: "仅支持 JPG、PNG 或 WebP 图片",
    });
  });

  it("rejects empty and over-5MB source files", () => {
    expect(validateLetterImage(fileOf(0)).ok).toBe(false);
    expect(validateLetterImage(fileOf(5 * 1024 * 1024 + 1)).ok).toBe(false);
  });

  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts non-empty %s files within the limit",
    (type) => {
      expect(validateLetterImage(fileOf(10, "photo", type))).toEqual({ ok: true });
    },
  );
});

describe("compressLetterImage", () => {
  it("shrinks the longest edge to 2000 without changing aspect ratio", async () => {
    const encode = vi.fn(async () => new Blob([new Uint8Array(120)], { type: "image/webp" }));
    const close = vi.fn();
    const adapter: ImageCompressionAdapter = {
      decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width: 4000, height: 1000, close })),
      encode,
    };

    const result = await compressLetterImage(fileOf(200), 2000, 0.82, adapter);

    expect(encode).toHaveBeenCalledWith(expect.anything(), 2000, 500, 0.82);
    expect(close).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ width: 2000, height: 500, sizeBytes: 120 });
    expect(result.file.name).toBe("photo.webp");
    expect(result.file.type).toBe("image/webp");
  });

  it("does not enlarge a small transparent PNG", async () => {
    const encode = vi.fn(async () => new Blob(["webp"], { type: "image/webp" }));
    const adapter: ImageCompressionAdapter = {
      decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width: 320, height: 180 })),
      encode,
    };

    const result = await compressLetterImage(fileOf(20, "alpha.png", "image/png"), 2000, 0.82, adapter);

    expect(encode).toHaveBeenCalledWith(expect.anything(), 320, 180, 0.82);
    expect(result.width).toBe(320);
    expect(result.height).toBe(180);
  });

  it("rejects null canvas output, decode failures, and oversized compressed output", async () => {
    const decoded = { source: {} as CanvasImageSource, width: 100, height: 100 };
    await expect(
      compressLetterImage(fileOf(20), 2000, 0.82, {
        decode: async () => decoded,
        encode: async () => null,
      }),
    ).rejects.toThrow("图片压缩失败");

    await expect(
      compressLetterImage(fileOf(20), 2000, 0.82, {
        decode: async () => {
          throw new Error("decoder exploded");
        },
        encode: async () => new Blob(),
      }),
    ).rejects.toThrow("无法读取这张图片");

    await expect(
      compressLetterImage(fileOf(20), 2000, 0.82, {
        decode: async () => decoded,
        encode: async () => new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/webp" }),
      }),
    ).rejects.toThrow("压缩后的图片仍超过 5MB");
  });

  it("rejects a browser that silently falls back to PNG instead of WebP", async () => {
    await expect(
      compressLetterImage(fileOf(20), 2000, 0.82, {
        decode: async () => ({
          source: {} as CanvasImageSource,
          width: 100,
          height: 100,
        }),
        encode: async () => new Blob(["png bytes"], { type: "image/png" }),
      }),
    ).rejects.toThrow("当前浏览器不支持图片压缩");
  });
});
