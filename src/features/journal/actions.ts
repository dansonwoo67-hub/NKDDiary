"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getJournalEntry } from "@/features/journal/repository";
import { cleanupJournalImage } from "@/features/media/storage-cleanup";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const contentFields = {
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(20_000),
};

const futureDiarySchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  recipientId: z.string().uuid(),
  openAt: z.string().datetime({ offset: true }),
}).strict();
const todayDiarySchema = z.object({
  ...contentFields,
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
const updateTodayDiarySchema = z.object({
  ...contentFields,
}).strict();
const entryIdSchema = z.string().uuid();

type ActionSuccess = { ok: true; message: string; entryId?: string };
type ActionFailure = { ok: false; message: string };
export type JournalActionResult = ActionSuccess | ActionFailure;

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  constraint?: string;
  constraint_name?: string;
} | null;

function failureFor(
  error: DatabaseError,
  quota?: { index: string; message: string },
): ActionFailure {
  const identifiesQuota = [
    error?.message,
    error?.details,
    error?.hint,
    error?.constraint,
    error?.constraint_name,
  ].some((value) => value?.includes(quota?.index ?? "") && Boolean(quota?.index));

  if (error?.code === "23505" && quota && identifiesQuota) {
    return { ok: false, message: quota.message };
  }
  return { ok: false, message: "刚刚没有成功，请别担心，内容还在这里。稍后再试一次就好啦。" };
}

function resultId(data: unknown): string | undefined {
  const value = Array.isArray(data) ? data[0] : data;
  if (typeof value !== "object" || value === null || !("id" in value)) return undefined;
  return typeof value.id === "string" ? value.id : undefined;
}

function revalidateJournal(entryId?: string, includeFuture = false) {
  revalidatePath("/");
  revalidatePath("/journal");
  if (includeFuture) revalidatePath("/journal/future");
  if (entryId) revalidatePath(`/journal/${entryId}`);
}

export async function createTodayDiaryAction(input: unknown): Promise<JournalActionResult> {
  const parsed = todayDiarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "日记内容需要重新检查一下哦。" };

  const { spaceId } = await requireUser();
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("create_today_diary", {
    p_space_id: spaceId,
    p_title: parsed.data.title,
    p_content: parsed.data.content,
    p_entry_date: parsed.data.entryDate,
    p_image_path: null,
  });

  if (error) {
    return failureFor(error, {
      index: "one_today_diary_per_author_date",
      message: "今天已经写过一篇日记了，明天再继续记录我们的故事吧。",
    });
  }
  const entryId = resultId(data);
  revalidateJournal(entryId);
  return { ok: true, message: "今天日记已发布。", entryId };
}

export async function sealFutureDiaryAction(input: unknown): Promise<JournalActionResult> {
  const parsed = futureDiarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "胶囊信内容需要重新检查一下哦。" };
  if (new Date(parsed.data.openAt).getTime() <= Date.now()) {
    return { ok: false, message: "这个时间已经悄悄过去啦，帮小胶囊选一个未来的时间吧。" };
  }

  const { spaceId } = await requireUser();
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("seal_future_diary", {
    p_space_id: spaceId,
    p_title: "",
    p_content: parsed.data.content,
    p_recipient_id: parsed.data.recipientId,
    p_open_at: parsed.data.openAt,
    p_image_path: null,
  });

  if (error) {
    if (error.message?.includes("DAILY_CAPSULE_LETTER_LIMIT_REACHED")) {
      return { ok: false, message: "今天的小胶囊已经认真封存好一封啦，明天 00:00 后就可以再写新的哦。" };
    }
    return failureFor(error, {
      index: "one_future_diary_per_author_creation_date",
      message: "今天已经封存过一封胶囊信了，明天再继续写吧。",
    });
  }
  const entryId = resultId(data);
  revalidateJournal(entryId, true);
  return { ok: true, message: "胶囊信已封存，会在约定时间送到 TA 手中。", entryId };
}

export async function updateTodayDiaryAction(
  entryId: string,
  input: unknown,
): Promise<JournalActionResult> {
  const parsedId = entryIdSchema.safeParse(entryId);
  const parsed = updateTodayDiarySchema.safeParse(input);
  if (!parsedId.success || !parsed.success) {
    return { ok: false, message: "日记内容需要重新检查一下哦。" };
  }

  await requireUser();
  const client = await createServerSupabaseClient();
  const existingEntry = await getJournalEntry(client, parsedId.data);
  if (!existingEntry) return { ok: false, message: "请稍等，好像出了点小问题。" };

  const { error } = await client.rpc("update_today_diary", {
    p_entry_id: parsedId.data,
    p_title: parsed.data.title,
    p_content: parsed.data.content,
    p_image_path: existingEntry.imagePath,
  });

  if (error) return failureFor(error);
  revalidateJournal(parsedId.data);
  return { ok: true, message: "日记已更新。", entryId: parsedId.data };
}

export async function updateFutureDiaryAction(input: unknown): Promise<JournalActionResult> {
  const schema = z.object({
    entryId: z.string().uuid(),
    content: z.string().trim().min(1).max(20_000),
    openAt: z.string().datetime({ offset: true }),
  }).strict();
  
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "胶囊信内容需要重新检查一下哦。" };
  if (new Date(parsed.data.openAt).getTime() <= Date.now()) {
    return { ok: false, message: "这个时间已经悄悄过去啦，帮小胶囊选一个未来的时间吧。" };
  }

  await requireUser();
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("update_future_diary", {
    p_entry_id: parsed.data.entryId,
    p_title: "",
    p_content: parsed.data.content,
    p_open_at: parsed.data.openAt,
    p_image_path: null,
  });

  if (error) return failureFor(error);
  revalidateJournal(parsed.data.entryId, true);
  return { ok: true, message: "胶囊信已更新。", entryId: parsed.data.entryId };
}

export async function openFutureDiaryAction(entryId: string): Promise<JournalActionResult> {
  const parsed = entryIdSchema.safeParse(entryId);
  if (!parsed.success) return { ok: false, message: "请稍等，好像出了点小问题。" };

  await requireUser();
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("open_future_diary", { p_entry_id: parsed.data });

  if (error) return failureFor(error);
  revalidateJournal(parsed.data, true);
  return { ok: true, message: "胶囊信已开启，可以一起阅读啦。", entryId: parsed.data };
}

export async function deleteTodayDiaryAction(entryId: string): Promise<JournalActionResult> {
  const parsed = entryIdSchema.safeParse(entryId);
  if (!parsed.success) return { ok: false, message: "请稍等，好像出了点小问题。" };

  await requireUser();
  const client = await createServerSupabaseClient();
  const existingEntry = await getJournalEntry(client, parsed.data);
  if (!existingEntry) return { ok: false, message: "请稍等，好像出了点小问题。" };
  const { error } = await client.rpc("delete_today_diary", { p_entry_id: parsed.data });

  if (error) return failureFor(error);
  revalidateJournal();
  if (existingEntry.imagePath) {
    const cleanup = await cleanupJournalImage(client, {
      spaceId: existingEntry.spaceId,
      authorId: existingEntry.authorId,
      entryId: parsed.data,
      reason: "diary_deleted",
    });
    if (cleanup === "failed") {
      return { ok: false, message: "日记已删除，但图片清理未完成，请稍后再试。" };
    }
    if (cleanup === "queued") {
      return { ok: true, message: "日记已删除，图片清理已进入重试队列。", entryId: parsed.data };
    }
  }
  return { ok: true, message: "日记已删除。", entryId: parsed.data };
}
