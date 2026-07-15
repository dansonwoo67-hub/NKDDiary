"use client";

import { ImagePlus, LoaderCircle, RefreshCcw } from "lucide-react";
import { useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  completeLetterImageUploadAction,
  createLetterImageUploadAction,
  failLetterImageUploadAction,
} from "./image-actions";
import type {
  CompleteLetterImageInput,
  CreateLetterImageInput,
  LetterImageActionResult,
} from "./image-actions-core";
import {
  compressLetterImage,
  type CompressedLetterImage,
} from "./image-compression";

export type ImageUploadDependencies = {
  compress(file: File): Promise<CompressedLetterImage>;
  createUpload(input: CreateLetterImageInput): Promise<LetterImageActionResult>;
  uploadAuthenticated(path: string, file: File): Promise<void>;
  completeUpload(input: CompleteLetterImageInput): Promise<LetterImageActionResult>;
  failUpload(input: CompleteLetterImageInput): Promise<LetterImageActionResult>;
};

const defaultDependencies: ImageUploadDependencies = {
  compress: compressLetterImage,
  createUpload: createLetterImageUploadAction,
  async uploadAuthenticated(path, file) {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.storage
      .from("letter-images")
      .upload(path, file, { contentType: "image/webp", upsert: false });
    if (error) throw error;
  },
  completeUpload: completeLetterImageUploadAction,
  failUpload: failLetterImageUploadAction,
};

export function ImageUploadButton({
  letterId,
  onUploaded,
  deps = defaultDependencies,
}: {
  letterId: string | undefined;
  onUploaded: (src: string) => void;
  deps?: ImageUploadDependencies;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    assetId: string;
    path: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm(pending: { assetId: string; path: string }) {
    if (busyRef.current) return;
    busyRef.current = true;
    setUploading(true);
    setError(null);
    try {
      const completed = await deps.completeUpload(pending);
      if (!completed.ok || !("src" in completed)) {
        if (!completed.ok && completed.code === "CLEANED") {
          setPendingConfirmation(null);
          throw new Error(completed.message);
        }
        if (!completed.ok && completed.code === "NOT_FOUND") {
          try {
            await deps.failUpload(pending);
          } catch {
            // The server-retained tombstone makes later cleanup possible.
          }
          setPendingConfirmation(null);
        }
        throw new Error(completed.ok ? "图片地址无效" : completed.message);
      }
      setPendingConfirmation(null);
      onUploaded(completed.src);
      setLastFile(null);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "请稍后重试";
      setError(`图片上传失败：${detail}`);
    } finally {
      busyRef.current = false;
      setUploading(false);
    }
  }

  async function upload(file: File) {
    if (!letterId || busyRef.current) return;
    busyRef.current = true;
    setUploading(true);
    setError(null);
    setLastFile(file);
    let pending: { assetId: string; path: string } | null = null;
    let objectUploaded = false;
    try {
      const compressed = await deps.compress(file);
      const created = await deps.createUpload({
        letterId,
        mimeType: "image/webp",
        width: compressed.width,
        height: compressed.height,
        sizeBytes: compressed.sizeBytes,
      });
      if (!created.ok || !("path" in created)) {
        throw new Error(created.ok ? "图片上传路径无效" : created.message);
      }
      pending = { assetId: created.assetId, path: created.path };
      await deps.uploadAuthenticated(created.path, compressed.file);
      objectUploaded = true;
      setPendingConfirmation(pending);
      const completed = await deps.completeUpload(pending);
      if (!completed.ok || !("src" in completed)) {
        if (!completed.ok && completed.code === "CLEANED") {
          setPendingConfirmation(null);
          throw new Error(completed.message);
        }
        if (!completed.ok && completed.code === "NOT_FOUND") {
          try {
            await deps.failUpload(pending);
          } catch {
            // The server-retained tombstone makes later cleanup possible.
          }
          setPendingConfirmation(null);
        }
        throw new Error(completed.ok ? "图片地址无效" : completed.message);
      }
      pending = null;
      setPendingConfirmation(null);
      onUploaded(completed.src);
      setLastFile(null);
    } catch (cause) {
      if (pending && !objectUploaded) {
        try {
          await deps.failUpload(pending);
        } catch {
          // The failed row can be cleaned by a later maintenance job.
        }
      }
      const detail = cause instanceof Error ? cause.message : "请稍后重试";
      setError(`图片上传失败：${detail}`);
    } finally {
      busyRef.current = false;
      setUploading(false);
    }
  }

  const preparing = !letterId;
  const retrying = Boolean(error && (pendingConfirmation || lastFile));
  const label = retrying ? "重试图片" : "插入图片";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        aria-label="选择信件图片"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        disabled={preparing || uploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        aria-label={label}
        disabled={preparing || uploading}
        onClick={() => {
          if (retrying && pendingConfirmation) void confirm(pendingConfirmation);
          else if (retrying && lastFile) void upload(lastFile);
          else inputRef.current?.click();
        }}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-[rgb(71_56_45_/_12%)] bg-white/65 px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-[rgb(152_74_79_/_55%)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#984a4f] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
      >
        {uploading ? (
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        ) : retrying ? (
          <RefreshCcw aria-hidden="true" className="h-4 w-4" />
        ) : (
          <ImagePlus aria-hidden="true" className="h-4 w-4" />
        )}
        <span>{uploading ? "上传中" : label}</span>
      </button>
      {preparing ? <span className="text-xs text-[var(--muted-ink)]">正在准备信纸</span> : null}
      {error ? <span role="alert" className="max-w-48 text-xs text-[#8a3f45]">{error}</span> : null}
    </div>
  );
}
