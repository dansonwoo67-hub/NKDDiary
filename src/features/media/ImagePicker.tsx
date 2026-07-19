"use client";

import { useCallback, useId, useState } from "react";
import { compressJournalImage } from "./compress-image";

type ImagePickerProps = {
  value: Blob | null;
  onChange: (image: Blob | null) => void;
  disabled?: boolean;
};

function ObjectUrlPreview({ image, onRemove, disabled }: {
  image: Blob;
  onRemove: () => void;
  disabled: boolean;
}) {
  const attachPreview = useCallback((element: HTMLImageElement | null) => {
    if (!element) return;
    const objectUrl = URL.createObjectURL(image);
    element.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  return (
    <div className="mt-4">
      {/* Blob previews are local-only and cannot be optimized by Next Image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={attachPreview}
        alt="所选日记图片预览"
        className="max-h-80 w-full rounded-2xl object-contain"
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="mt-3 rounded-full border border-[rgb(71_56_45_/_28%)] px-4 py-2 text-sm text-[var(--ink)] disabled:opacity-50"
      >
        移除图片
      </button>
    </div>
  );
}

export function ImagePicker({ value, onChange, disabled = false }: ImagePickerProps) {
  const inputId = useId();
  const [message, setMessage] = useState("");
  const [isCompressing, setIsCompressing] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMessage("");
    setIsCompressing(true);
    try {
      onChange(await compressJournalImage(file));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片处理失败，请重试。");
    } finally {
      setIsCompressing(false);
    }
  }

  function handleRemove() {
    setMessage("");
    onChange(null);
  }

  return (
    <div className="mt-5 rounded-[1.5rem] border border-dashed border-[rgb(71_56_45_/_24%)] bg-white/45 p-4">
      <label className="block text-sm font-medium text-[var(--ink)]" htmlFor={inputId}>
        添加一张图片
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || isCompressing}
        onChange={handleFile}
        className="mt-2 block w-full text-sm text-[var(--muted-ink)] file:mr-3 file:rounded-full file:border-0 file:bg-white/80 file:px-4 file:py-2 file:text-[var(--ink)]"
      />
      <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
        支持 JPG、PNG、WebP，原图不超过 10MB；系统会压缩并移除照片元数据。
      </p>

      {isCompressing ? <p className="mt-3 text-sm text-[var(--muted-ink)]" role="status">正在压缩图片…</p> : null}
      {message ? <p className="mt-3 text-sm text-red-700" role="alert">{message}</p> : null}

      {value ? <ObjectUrlPreview image={value} onRemove={handleRemove} disabled={disabled || isCompressing} /> : null}
    </div>
  );
}
