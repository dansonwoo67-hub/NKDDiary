"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

export async function getUnreadNotifications(): Promise<NotificationItem[]> {
  await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, source_id, title, body, created_at")
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  const notifications = data ?? [];
  const letterIds = notifications
    .filter((item) => item.type === "annotation" || item.type === "annotation_reply" || item.type === "letter_opened")
    .map((item) => String(item.source_id));

  const letterDates = new Map<string, string>();
  if (letterIds.length > 0) {
    const { data: letters } = await supabase.from("letters").select("id, letter_date").in("id", letterIds);
    for (const letter of letters ?? []) {
      letterDates.set(String(letter.id), String(letter.letter_date));
    }
  }

  return notifications.map((item) => ({
    id: String(item.id),
    title: String(item.title),
    body: String(item.body),
    href: letterDates.has(String(item.source_id)) ? `/letters/${letterDates.get(String(item.source_id))}` : "/",
    createdAt: String(item.created_at),
  }));
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "已读。" };
}
