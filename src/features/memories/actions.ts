"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/features/profile/actions";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function validMemoryInput(input: { title: string; body: string; occurredOn: string }) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length > 30 || !body || body.length > 150 || !/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return null;
  return { title: title || "一段回忆", body, occurredOn: input.occurredOn };
}

function chinaDayBounds() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${parts}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function refreshMemoryViews() {
  revalidatePath("/");
  revalidatePath("/memories");
}

export async function createMemoryAction(formData: FormData): Promise<ActionResult> {
  const valid = validMemoryInput({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    occurredOn: String(formData.get("occurredOn") ?? ""),
  });
  if (!valid) return { ok: false, message: "回忆正文请控制在 150 字内，并选择有效日期。" };

  const image = formData.get("image");
  if (image instanceof File && image.size > 0 && (image.type !== "image/webp" || image.size > 819_200)) {
    return { ok: false, message: "图片需要是压缩后的 WebP，且不能超过 800KB。" };
  }

  const { userId, spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { start, end } = chinaDayBounds();
  const { count, error: countError } = await supabase
    .from("memory_entries")
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId)
    .gte("created_at", start)
    .lt("created_at", end);
  if (countError) return { ok: false, message: "暂时无法确认今天的记录次数，请稍后再试。" };
  if ((count ?? 0) >= 3) return { ok: false, message: "今天已经收藏了三段回忆，剩下的故事明天再慢慢写吧。" };

  const id = randomUUID();
  const imagePath = image instanceof File && image.size > 0 ? `${spaceId}/${userId}/${id}.webp` : null;
  if (imagePath && image instanceof File) {
    const { error } = await supabase.storage.from("memory-images").upload(imagePath, image, { contentType: "image/webp", upsert: false });
    if (error) return { ok: false, message: "图片暂时无法上传，请稍后再试。" };
  }

  const { error } = await supabase.rpc("create_memory_entry", {
    p_id: id, p_space_id: spaceId, p_title: valid.title, p_body: valid.body,
    p_occurred_on: valid.occurredOn, p_image_path: imagePath,
  });
  if (error) {
    if (imagePath) await supabase.storage.from("memory-images").remove([imagePath]);
    return { ok: false, message: "回忆暂时无法保存，请稍后再试。" };
  }
  refreshMemoryViews();
  return { ok: true, message: "这段回忆已经长在树上啦。" };
}

export async function updateMemoryAction(input: { id: string; title: string; body: string; occurredOn: string }): Promise<ActionResult> {
  const valid = validMemoryInput(input);
  if (!input.id || !valid) return { ok: false, message: "回忆正文请控制在 150 字内，并选择有效日期。" };
  await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_memory_entry", { p_id: input.id, p_title: valid.title, p_body: valid.body, p_occurred_on: valid.occurredOn });
  if (error) return { ok: false, message: "这条回忆已无法编辑。" };
  refreshMemoryViews();
  return { ok: true, message: "回忆已更新。" };
}

export async function updateMemoryFromForm(formData: FormData) {
  await updateMemoryAction({ id: String(formData.get("id") ?? ""), title: String(formData.get("title") ?? ""), body: String(formData.get("body") ?? ""), occurredOn: String(formData.get("occurredOn") ?? "") });
}

export async function deleteMemoryAction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, message: "缺少回忆记录。" };
  await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("delete_memory_entry", { p_id: id });
  if (error) return { ok: false, message: "这条回忆已无法删除。" };
  if (typeof data === "string" && data) await supabase.storage.from("memory-images").remove([data]);
  refreshMemoryViews();
  return { ok: true, message: "回忆已删除。" };
}

export async function deleteMemoryFromForm(formData: FormData) { await deleteMemoryAction(String(formData.get("id") ?? "")); }
