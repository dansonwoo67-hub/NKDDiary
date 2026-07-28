"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { upsertDraft, deleteDraft, getDraftByAuthor, type LetterDraft } from "./draft-repository";

const theme = z.enum(["cream", "rose", "moon", "vintage", "sakura", "lined"]);
const moodEmoji = z.enum(["😊", "💕", "🥺", "😤", "😴", "🤔", "😌", "😭"]).optional();

const saveDraftSchema = z.object({
  recipientId: z.string().uuid(),
  html: z.string().max(50000),
  text: z.string().trim().max(5000),
  stationeryTheme: theme,
  moodEmoji: moodEmoji,
  salutation: z.string().max(50).optional(),
});

type ActionResult = { ok: boolean; message: string; draftId?: string | null };

function result(ok: boolean, message: string, draftId?: string | null): ActionResult {
  return { ok, message, draftId };
}

export async function saveDraftAction(input: unknown): Promise<ActionResult> {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return result(false, "草稿内容需要重新检查一下哦。");
  }

  const { userId, spaceId } = await requireUser();
  const client = await createServerSupabaseClient();

  const { success, draftId } = await upsertDraft(client, {
    spaceId,
    authorId: userId,
    recipientId: parsed.data.recipientId,
    richTextJson: { html: parsed.data.html, text: parsed.data.text },
    plainText: parsed.data.text,
    moodEmoji: parsed.data.moodEmoji ?? null,
    stationeryTheme: parsed.data.stationeryTheme,
    salutation: parsed.data.salutation ?? null,
    characterCount: Array.from(parsed.data.text).length,
  });

  if (!success) {
    return result(false, "草稿刚刚没有保存成功，别担心，内容还在这里。稍后再试一次就好啦。", null);
  }

  revalidatePath("/journal");
  return result(true, "草稿已保存。", draftId);
}

export async function deleteDraftAction(): Promise<ActionResult> {
  const { userId } = await requireUser();
  const client = await createServerSupabaseClient();

  const success = await deleteDraft(client, userId);

  if (!success) {
    return result(false, "草稿删除没有成功，别担心，请稍后再试。");
  }

  revalidatePath("/journal");
  return result(true, "草稿已删除。");
}

export async function getCurrentDraft(): Promise<{ draft: LetterDraft | null; error: string | null }> {
  try {
    const { userId } = await requireUser();
    const client = await createServerSupabaseClient();
    const draft = await getDraftByAuthor(client, userId);
    return { draft, error: null };
  } catch (error) {
    console.error("getCurrentDraft error:", error);
    return { draft: null, error: "草稿暂时没有找到，请稍后再试。" };
  }
}

export async function sendAndClearDraft(input: unknown): Promise<{ ok: boolean; message: string; entryId?: string }> {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "这封信还没有写下内容呢，留几句话再寄出去吧。" };
  }

  const { userId, spaceId } = await requireUser();
  const client = await createServerSupabaseClient();
  const html = parsed.data.html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/<(?!\/?(?:p|br|strong|b|em|i|u|s|ul|ol|li|blockquote|hr|div|span)\b)[^>]*>/gi, "");

  const { data, error } = await client.rpc("create_letter_diary", {
    p_space_id: spaceId,
    p_recipient_id: parsed.data.recipientId,
    p_rich_content: { type: "doc", html, text: parsed.data.text },
    p_plain_text: parsed.data.text,
    p_stationery_theme: parsed.data.stationeryTheme,
    p_mood_emoji: parsed.data.moodEmoji ?? null,
  });

  if (error) {
    console.error("sendAndClearDraft create error:", error);
    return { ok: false, message: "刚刚没有寄信成功，别担心，内容还在这里。稍后再试一次就好啦。" };
  }

  const entryId = typeof data === "string" ? data : undefined;

  const deleteSuccess = await deleteDraft(client, userId);
  if (!deleteSuccess) {
    console.warn("sendAndClearDraft delete draft failed, but letter was sent");
  }

  revalidatePath("/");
  revalidatePath("/journal");
  if (entryId) revalidatePath(`/journal/${entryId}`);

  return { ok: true, message: "这封信，已经在去见 TA 的路上了。", entryId };
}
