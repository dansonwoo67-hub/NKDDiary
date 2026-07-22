"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { JournalActionResult } from "@/features/journal/actions";
import { getJournalEntry } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  cleanupJournalImage,
  enqueueJournalImageReconciliation,
} from "./storage-cleanup";

const MAX_IMAGE_BYTES = 800 * 1024;
const entryIdSchema = z.string().uuid();
const contentFields = {
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(20_000),
};
const uploadInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create-today"),
    ...contentFields,
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  z.object({
    kind: z.literal("update-today"),
    ...contentFields,
    entryId: entryIdSchema,
  }).strict(),
  z.object({
    kind: z.literal("seal-future"),
    ...contentFields,
    recipientId: z.string().uuid(),
    openAt: z.string().datetime({ offset: true }),
  }).strict(),
]);

async function validCompressedImage(value: FormDataEntryValue | null): Promise<boolean> {
  if (!(value instanceof Blob)
    || value.type !== "image/webp"
    || value.size < 12
    || value.size > MAX_IMAGE_BYTES
  ) return false;

  const header = new Uint8Array(await value.slice(0, 12).arrayBuffer());
  return header[0] === 0x52
    && header[1] === 0x49
    && header[2] === 0x46
    && header[3] === 0x46
    && header[8] === 0x57
    && header[9] === 0x45
    && header[10] === 0x42
    && header[11] === 0x50;
}

function revalidateJournal(entryId: string, includeFuture = false) {
  revalidatePath("/");
  revalidatePath("/journal");
  if (includeFuture) revalidatePath("/journal/future");
  revalidatePath(`/journal/${entryId}`);
}

export async function uploadJournalImageAction(
  input: unknown,
  formData: FormData,
): Promise<JournalActionResult> {
  const parsed = uploadInputSchema.safeParse(input);
  const image = formData.get("image");
  if (!parsed.success) return { ok: false, message: "日记内容无效。" };
  if (parsed.data.kind === "seal-future" && new Date(parsed.data.openAt).getTime() <= Date.now()) {
    return { ok: false, message: "请选择晚于现在的有效开启时间。" };
  }
  if (!(await validCompressedImage(image))) return { ok: false, message: "图片格式或大小无效。" };
  const compressedImage = image as File;

  const { userId, spaceId } = await requireUser();
  const client = await createServerSupabaseClient();
  const entryId = parsed.data.kind === "update-today" ? parsed.data.entryId : randomUUID();
  const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
  let upsert = false;
  if (parsed.data.kind === "update-today") {
    const existingEntry = await getJournalEntry(client, entryId);
    if (
      !existingEntry
      || existingEntry.entryType !== "today"
      || existingEntry.spaceId !== spaceId
      || existingEntry.authorId !== userId
    ) {
      return { ok: false, message: "操作失败，请稍后再试。" };
    }
    upsert = existingEntry.imagePath === imagePath;
  }
  const bucket = client.storage.from("journal-images");
  const writeDiary = () => parsed.data.kind === "create-today"
    ? client.rpc("create_today_diary", {
          p_space_id: spaceId,
          p_title: parsed.data.title,
          p_content: parsed.data.content,
          p_entry_date: parsed.data.entryDate,
          p_image_path: imagePath,
          p_entry_id: entryId,
        })
    : parsed.data.kind === "seal-future"
      ? client.rpc("seal_future_diary", {
          p_space_id: spaceId,
          p_title: parsed.data.title,
          p_content: parsed.data.content,
          p_recipient_id: parsed.data.recipientId,
          p_open_at: parsed.data.openAt,
          p_image_path: imagePath,
          p_entry_id: entryId,
        })
      : client.rpc("update_today_diary", {
          p_entry_id: entryId,
          p_title: parsed.data.title,
          p_content: parsed.data.content,
          p_image_path: imagePath,
        });

  if (upsert) {
    try {
      const rpcResult = await writeDiary();
      if (rpcResult.error) return { ok: false, message: "操作失败，请稍后再试。" };
    } catch {
      return { ok: false, message: "操作失败，请稍后再试。" };
    }

    const backupId = randomUUID();
    const backupPath = `${spaceId}/${userId}/.backups/${entryId}/${backupId}.webp`;
    try {
      const { error: backupError } = await bucket.copy(imagePath, backupPath);
      if (backupError) return { ok: false, message: "图片备份失败，原图片未更改。" };
    } catch {
      await cleanupJournalImage(client, {
        spaceId,
        authorId: userId,
        entryId,
        backupId,
        reason: "backup_cleanup_failed",
      });
      return { ok: false, message: "图片备份未确认，原图片未更改。" };
    }

    let replacementConfirmed = false;
    try {
      const { error: uploadError } = await bucket.upload(imagePath, compressedImage, {
        contentType: "image/webp",
        upsert: true,
      });
      replacementConfirmed = !uploadError;
    } catch {
      // A transport error can arrive after Storage committed the upsert.
    }

    if (replacementConfirmed) {
      const backupCleanup = await cleanupJournalImage(client, {
        spaceId,
        authorId: userId,
        entryId,
        backupId,
        reason: "backup_cleanup_failed",
      });
      revalidateJournal(entryId);
      return backupCleanup === "failed"
        ? { ok: true, message: "日记已更新，但旧图备份清理未完成，请联系管理员。", entryId }
        : { ok: true, message: "日记已更新。", entryId };
    }

    try {
      const { data: backupBytes, error: downloadError } = await bucket.download(backupPath);
      if (!downloadError && backupBytes) {
        const { error: restoreError } = await bucket.upload(imagePath, backupBytes, {
          contentType: "image/webp",
          upsert: true,
        });
        if (!restoreError) {
          const backupCleanup = await cleanupJournalImage(client, {
            spaceId,
            authorId: userId,
            entryId,
            backupId,
            reason: "backup_cleanup_failed",
          });
          if (backupCleanup === "queued") {
            return {
              ok: false,
              message: "日记文字已保存，但图片替换失败，原图片仍保留；旧图备份清理已进入队列。",
            };
          }
          if (backupCleanup === "failed") {
            return {
              ok: false,
              message: "日记文字已保存，原图片已恢复，但旧图备份清理未完成，请联系管理员。",
            };
          }
          return { ok: false, message: "日记文字已保存，但图片替换失败，原图片仍保留。" };
        }
      }
    } catch {
      // Keep the backup until durable reconciliation is confirmed below.
    }

    const queued = await enqueueJournalImageReconciliation(client, {
      spaceId,
      authorId: userId,
      entryId,
      backupId,
      reason: "replacement_restore_failed",
    });
    return queued === "queued"
      ? { ok: false, message: "图片替换未确认，旧图备份已保留并进入恢复队列。" }
      : { ok: false, message: "图片替换未确认，旧图备份已保留，请联系管理员。" };
  }

  try {
    const { error: uploadError } = await bucket.upload(imagePath, compressedImage, {
      contentType: "image/webp",
      upsert: false,
    });
    if (uploadError) return { ok: false, message: "图片上传失败，请稍后再试。" };
  } catch {
    const cleanup = await cleanupJournalImage(client, {
      spaceId,
      authorId: userId,
      entryId,
      reason: "database_write_failed",
    });
    return cleanup === "failed"
      ? { ok: false, message: "图片上传未确认，且清理未完成，请联系管理员。" }
      : { ok: false, message: "图片上传失败，请稍后再试。" };
  }

  try {
    const rpcResult = await writeDiary();

    if (rpcResult.error) {
      const cleanup = await cleanupJournalImage(client, {
        spaceId,
        authorId: userId,
        entryId,
        reason: "database_write_failed",
      });
      return cleanup === "failed"
        ? { ok: false, message: "操作失败，且图片清理未完成，请联系管理员。" }
        : { ok: false, message: "操作失败，请稍后再试。" };
    }

    revalidateJournal(entryId, parsed.data.kind === "seal-future");
    if (parsed.data.kind === "create-today") {
      return { ok: true, message: "今天日记已发布。", entryId };
    }
    if (parsed.data.kind === "seal-future") {
      return { ok: true, message: "未来日记已封存。", entryId };
    }
    return { ok: true, message: "日记已更新。", entryId };
  } catch {
    const cleanup = await cleanupJournalImage(client, {
      spaceId,
      authorId: userId,
      entryId,
      reason: "database_write_failed",
    });
    return cleanup === "failed"
      ? { ok: false, message: "操作失败，且图片清理未完成，请联系管理员。" }
      : { ok: false, message: "操作失败，请稍后再试。" };
  }
}

export async function getReadableImageUrl(entryId: string): Promise<string | null> {
  const parsedId = entryIdSchema.safeParse(entryId);
  if (!parsedId.success) return null;

  await requireUser();
  const client = await createServerSupabaseClient();
  const entry = await getJournalEntry(client, parsedId.data);
  if (!entry?.imagePath) return null;
  const expectedPath = `${entry.spaceId}/${entry.authorId}/${entry.id}.webp`;
  if (entry.imagePath !== expectedPath) return null;

  const { data, error } = await client.storage
    .from("journal-images")
    .createSignedUrl(entry.imagePath, 300);
  return error ? null : data.signedUrl;
}
