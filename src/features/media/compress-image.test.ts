import { afterEach, describe, expect, it, vi } from "vitest";
import { compressJournalImage, validateSourceImage } from "./compress-image";

describe("journal image policy", () => {
  it("rejects GIF files", () => {
    expect(() => validateSourceImage({ type: "image/gif", size: 1_000 })).toThrow(
      "图片格式需要是 JPG、PNG 或 WebP 哦。",
    );
  });

  it("rejects source files larger than 10 MB", () => {
    expect(() =>
      validateSourceImage({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 }),
    ).toThrow("图片太大啦，不要超过 10MB 哦。");
  });

  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s at the source size limit",
    (type) => {
      expect(() =>
        validateSourceImage({ type, size: 10 * 1024 * 1024 }),
      ).not.toThrow();
    },
  );
});

describe("compressJournalImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scales the longest edge to 1600 and exports WebP at quality 0.75", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 3_200, height: 1_200, close }),
    );
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
      expect(type).toBe("image/webp");
      expect(quality).toBe(0.75);
      callback(new Blob([new Uint8Array(400 * 1024)], { type: "image/webp" }));
    });
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      expect(tagName).toBe("canvas");
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob,
      } as unknown as HTMLCanvasElement;
    });

    const output = await compressJournalImage(
      new File([new Uint8Array(1_024)], "photo.jpg", { type: "image/jpeg" }),
    );

    expect(output.type).toBe("image/webp");
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 3_200, height: 1_200 }),
      0,
      0,
      1_600,
      600,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects compressed output larger than 800 KB", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
    );
    vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback) =>
        callback(new Blob([new Uint8Array(800 * 1024 + 1)], { type: "image/webp" })),
    } as unknown as HTMLCanvasElement);

    await expect(
      compressJournalImage(
        new File([new Uint8Array(1_024)], "photo.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("压缩后的图片仍然过大，选一张内容简单一点的图片吧。");
  });

  it("retries below the initial quality to aim for 500 KB", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1_600, height: 1_200, close: vi.fn() }),
    );
    const qualities: number[] = [];
    vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback, _type?: string, quality?: number) => {
        qualities.push(quality ?? 0);
        const size = quality === 0.75 ? 600 * 1024 : 480 * 1024;
        callback(new Blob([new Uint8Array(size)], { type: "image/webp" }));
      },
    } as unknown as HTMLCanvasElement);

    const output = await compressJournalImage(
      new File([new Uint8Array(1_024)], "photo.webp", { type: "image/webp" }),
    );

    expect(output.size).toBe(480 * 1024);
    expect(qualities).toEqual([0.75, 0.65]);
  });
});
