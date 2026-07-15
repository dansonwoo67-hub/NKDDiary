"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { buildNotificationHref } from "./hrefs";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

type SourceTarget = {
  letterDate: string;
  letterId: string;
  annotationId?: string;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getUnreadNotifications(): Promise<NotificationItem[]> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, source_id, title, body, created_at")
    .eq("recipient_id", userId)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  const notifications = data ?? [];
  const sourceIds = notifications.map((item) => String(item.source_id));

  const targets = new Map<string, SourceTarget>();
  if (sourceIds.length > 0) {
    const { data: letters } = await supabase.from("letters").select("id, letter_date").in("id", sourceIds);
    for (const letter of letters ?? []) {
      targets.set(String(letter.id), { letterId: String(letter.id), letterDate: String(letter.letter_date) });
    }

    const { data: annotations } = await supabase
      .from("annotations")
      .select("id, letter_id, letters:letter_id(letter_date)")
      .in("id", sourceIds);
    for (const annotation of annotations ?? []) {
      const letter = one(annotation.letters);
      if (!letter) continue;
      targets.set(String(annotation.id), {
        annotationId: String(annotation.id),
        letterId: String(annotation.letter_id),
        letterDate: String(letter.letter_date),
      });
    }

    const { data: replies } = await supabase
      .from("annotation_replies")
      .select("id, annotations:annotation_id(id, letter_id, letters:letter_id(letter_date))")
      .in("id", sourceIds);
    for (const reply of replies ?? []) {
      const annotation = one(reply.annotations);
      const letter = annotation ? one(annotation.letters) : null;
      if (!annotation || !letter) continue;
      targets.set(String(reply.id), {
        annotationId: String(annotation.id),
        letterId: String(annotation.letter_id),
        letterDate: String(letter.letter_date),
      });
    }
  }

  return notifications.map((item) => {
    const target = targets.get(String(item.source_id));
    return {
      id: String(item.id),
      title: String(item.title),
      body: String(item.body),
      href: buildNotificationHref({
        type: String(item.type),
        letterDate: target?.letterDate,
        letterId: target?.letterId,
        annotationId: target?.annotationId,
      }),
      createdAt: String(item.created_at),
    };
  });
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("recipient_id", userId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: "已读。" };
}
