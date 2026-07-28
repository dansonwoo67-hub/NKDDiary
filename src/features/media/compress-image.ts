const ACCEPTED_SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 800 * 1024;
const TARGET_OUTPUT_BYTES = 500 * 1024;
const MAX_EDGE = 1_600;
const WEBP_QUALITIES = [0.75, 0.65, 0.55] as const;

type SourceImage = Pick<Blob, "type" | "size">;

export function validateSourceImage(file: SourceImage): void {
  if (!ACCEPTED_SOURCE_TYPES.has(file.type)) {
    throw new Error("图片格式需要是 JPG、PNG 或 WebP 哦。");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("图片太大啦，不要超过 10MB 哦。");
  }
}

function scaledDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function exportWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片压缩没有成功，换一张图片试试看吧。"));
      },
      "image/webp",
      quality,
    );
  });
}

export async function compressJournalImage(file: File): Promise<Blob> {
  validateSourceImage(file);

  const bitmap = await createImageBitmap(file);
  try {
    const dimensions = scaledDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片，换个浏览器试试看吧。");

    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    let output: Blob | null = null;
    for (const quality of WEBP_QUALITIES) {
      output = await exportWebp(canvas, quality);
      if (output.size <= TARGET_OUTPUT_BYTES) break;
    }
    if (!output) throw new Error("图片压缩没有成功，换一张图片试试看吧。");
    if (output.size > MAX_OUTPUT_BYTES) {
      throw new Error("压缩后的图片仍然过大，选一张内容简单一点的图片吧。");
    }
    return output;
  } finally {
    bitmap.close();
  }
}
