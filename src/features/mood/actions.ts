"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { validateMoodInput } from "./rules";

function revalidateMoodViews() {
  revalidatePath("/");
  revalidatePath("/mood");
  revalidatePath("/memories");
}

async function createHomeMood(content: string, source: "manual" | "daily_quote"): Promise<ActionResult> {
  const { spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("create_home_mood", {
    p_space_id: spaceId,
    p_body: content,
    p_source: source,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("one minute") || message.includes("1 minute")) return { ok: false, message: "让这一刻多停留一会儿，稍后再写下一条吧。" };
    if (message.includes("daily mood limit")) return { ok: false, message: "今天的心情已经装满啦，明天再继续记录吧。" };
    if (message.includes("daily quote already shared")) return { ok: false, message: "这句话今天已经分享过啦。" };
    return { ok: false, message: "心情暂时没有保存，请稍后再试。" };
  }
  revalidateMoodViews();
  return { ok: true, message: "这份心情，已经被轻轻记下。" };
}

export async function createMoodAction(input: { content: string }): Promise<ActionResult> {
  const valid = validateMoodInput(input.content);
  if (!valid) return { ok: false, message: "纸短情长，15 个字刚刚好。" };
  return createHomeMood(valid.content, "manual");
}

export async function shareDailyQuoteAsMoodAction(quote: string): Promise<ActionResult> {
  const content = quote.trim();
  if (!content || content.length > 280) return { ok: false, message: "这句话暂时无法分享。" };
  return createHomeMood(content, "daily_quote");
}

export async function createMoodFromForm(_previousState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return createMoodAction({ content: String(formData.get("content") ?? "") });
}

export async function updateMoodAction(input: { id: string; content: string }): Promise<ActionResult> {
  const valid = validateMoodInput(input.content);
  if (!input.id || !valid) return { ok: false, message: "心情需要 1 到 15 个字符。" };
  await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_mood_entry", { p_id: input.id, p_body: valid.content });
  if (error) return { ok: false, message: "这条心情已无法编辑。" };
  revalidateMoodViews();
  return { ok: true, message: "心情已更新。" };
}

export async function updateMoodFromForm(formData: FormData) {
  await updateMoodAction({ id: String(formData.get("id") ?? ""), content: String(formData.get("content") ?? "") });
}

export async function deleteMoodAction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, message: "缺少心情记录。" };
  await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_mood_entry", { p_id: id });
  if (error) return { ok: false, message: "这条心情已无法删除。" };
  revalidateMoodViews();
  return { ok: true, message: "心情已删除。" };
}

export async function deleteMoodFromForm(formData: FormData) {
  await deleteMoodAction(String(formData.get("id") ?? ""));
}

export async function listRecentMoods() {
  const { spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("mood_entries")
    .select("id, author_id, body, emoji, created_at, profiles!mood_entries_author_id_fkey(display_name)")
    .eq("space_id", spaceId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error("Unable to load moods");
  return data ?? [];
}
