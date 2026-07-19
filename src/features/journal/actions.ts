"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getJournalEntry } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const contentFields = {
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(20_000),
};

const futureDiarySchema = z.object({
  ...contentFields,
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
  return { ok: false, message: "操作失败，请稍后再试。" };
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
  if (!parsed.success) return { ok: false, message: "日记内容或日期无效。" };

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
      message: "今天已经写过一篇日记了。",
    });
  }
  const entryId = resultId(data);
  revalidateJournal(entryId);
  return { ok: true, message: "今天日记已发布。", entryId };
}

export async function sealFutureDiaryAction(input: unknown): Promise<JournalActionResult> {
  const parsed = futureDiarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "未来日记内容无效。" };

  const { spaceId } = await requireUser();
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("seal_future_diary", {
    p_space_id: spaceId,
    p_title: parsed.data.title,
    p_content: parsed.data.content,
    p_recipient_id: parsed.data.recipientId,
    p_open_at: parsed.data.openAt,
    p_image_path: null,
  });

  if (error) {
    return failureFor(error, {
      index: "one_future_diary_per_author_creation_date",
      message: "今天已经写过一篇未来日记了。",
    });
  }
  const entryId = resultId(data);
  revalidateJournal(entryId, true);
  return { ok: true, message: "未来日记已封存。", entryId };
}

export async function updateTodayDiaryAction(
  entryId: string,
  input: unknown,
): Promise<JournalActionResult> {
  const parsedId = entryIdSchema.safeParse(entryId);
  const parsed = updateTodayDiarySchema.safeParse(input);
  if (!parsedId.success || !parsed.success) {
    return { ok: false, message: "日记内容无效。" };
  }

  await requireUser();
  const client = await createServerSupabaseClient();
  const existingEntry = await getJournalEntry(client, parsedId.data);
  if (!existingEntry) return { ok: false, message: "操作失败，请稍后再试。" };

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

export async function openFutureDiaryAction(entryId: string): Promise<JournalActionResult> {
  const parsed = entryIdSchema.safeParse(entryId);
  if (!parsed.success) return { ok: false, message: "操作失败，请稍后再试。" };

  await requireUser();
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("open_future_diary", { p_entry_id: parsed.data });

  if (error) return failureFor(error);
  revalidateJournal(parsed.data, true);
  return { ok: true, message: "未来日记已开启。", entryId: parsed.data };
}

export async function deleteTodayDiaryAction(entryId: string): Promise<JournalActionResult> {
  const parsed = entryIdSchema.safeParse(entryId);
  if (!parsed.success) return { ok: false, message: "操作失败，请稍后再试。" };

  await requireUser();
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("delete_today_diary", { p_entry_id: parsed.data });

  if (error) return failureFor(error);
  revalidateJournal();
  return { ok: true, message: "日记已删除。" };
}
