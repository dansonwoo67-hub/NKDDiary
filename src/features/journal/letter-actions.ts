"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const theme = z.enum(["cream", "rose", "moon", "vintage", "sakura", "lined"]);
const moodEmoji = z.enum(["😊", "💕", "🥺", "😤", "😴", "🤔", "😌", "😭"]).optional();

const letterSchema = z.object({
  recipientId: z.string().uuid(),
  html: z.string().max(50000),
  text: z.string().trim().min(1).max(5000),
  stationeryTheme: theme,
  moodEmoji: moodEmoji,
});

const idSchema = z.string().uuid();

function safeHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\sstyle\s*=\s*(["'])(?:(?!expression|url\().)*?\1/gi, (match) => match)
    .replace(/<(?!\/?(?:p|br|strong|b|em|i|u|s|ul|ol|li|blockquote|hr|div|span)\b)[^>]*>/gi, "");
}

function result(ok: boolean, message: string, entryId?: string) {
  return { ok, message, entryId };
}

function refresh(entryId?: string) {
  revalidatePath("/");
  revalidatePath("/journal");
  if (entryId) revalidatePath(`/journal/${entryId}`);
}

export async function createLetterAction(input: unknown) {
  const parsed = letterSchema.safeParse(input);
  if (!parsed.success) return result(false, "这封信还没有写下内容呢，留几句话再寄出去吧。");
  const { spaceId } = await requireUser();
  const client = await createServerSupabaseClient();
  const html = safeHtml(parsed.data.html);
  const { data, error } = await client.rpc("create_letter_diary", {
    p_space_id: spaceId,
    p_recipient_id: parsed.data.recipientId,
    p_rich_content: { type: "doc", html, text: parsed.data.text },
    p_plain_text: parsed.data.text,
    p_stationery_theme: parsed.data.stationeryTheme,
    p_mood_emoji: parsed.data.moodEmoji ?? null,
  });
  if (error) return result(false, "刚刚没有寄信成功，别担心，内容还在这里。稍后再试一次就好啦。");
  const entryId = typeof data === "string" ? data : undefined;
  refresh(entryId);
  return result(true, "这封信，已经在去见 TA 的路上了。", entryId);
}

export async function updateLetterAction() {
  return result(false, "这封信已经寄出，内容会一直留在彼此的信箱里。");
}

export async function withdrawLetterAction(entryId: string) {
  if (!idSchema.safeParse(entryId).success) return result(false, "请稍等，好像出了点小问题。");
  await requireUser();
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("withdraw_letter_diary", { p_entry_id: entryId });
  if (error) return result(false, "这封信寄出已经超过 24 小时啦，现在会安心留在彼此的信箱里。");
  refresh(entryId); return result(true, "信件已撤回。");
}

export async function markLetterReadAction(entryId: string) {
  if (!idSchema.safeParse(entryId).success) return result(false, "请稍等，好像出了点小问题。");
  await requireUser();
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("mark_letter_read", { p_entry_id: entryId });
  if (error) return result(false, "信件暂时无法标记已读，请稍后再试。");
  revalidatePath("/");
  return result(true, "已读。", entryId);
}

export async function toggleStarAction(entryId: string) {
  if (!idSchema.safeParse(entryId).success) return result(false, "请稍等，好像出了点小问题。");
  await requireUser();
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("toggle_letter_star", { p_entry_id: entryId });
  if (error) return result(false, "星标暂时无法添加，请稍后再试。");
  refresh(entryId);
  return result(true, data ? "已添加星标。" : "已取消星标。", entryId);
}
