"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { validateMoodInput } from "./rules";

export async function createMoodAction(input: { text: string; emoji: string }): Promise<ActionResult> {
  const valid = validateMoodInput(input);
  if (!valid) return { ok: false, message: "请写下一点心情或选择一个表情。" };
  const { spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("create_mood_entry", {
    p_space_id: spaceId, p_body: valid.text, p_emoji: valid.emoji,
  });
  if (error) return { ok: false, message: "心情暂时没有保存，请稍后再试。" };
  revalidatePath("/mood");
  revalidatePath("/memories");
  return { ok: true, message: "心情已记下。" };
}

export async function createMoodFromForm(formData: FormData) {
  await createMoodAction({ text: String(formData.get("text") ?? ""), emoji: String(formData.get("emoji") ?? "") });
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
