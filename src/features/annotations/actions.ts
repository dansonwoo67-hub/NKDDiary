"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import {
  createAnnotation,
  type AnnotationGateway,
  type CreateAnnotationInput,
} from "@/features/annotations/create-annotation-core";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createAnnotationAction(input: CreateAnnotationInput): Promise<ActionResult> {
  const { userId, profile } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const gateway: AnnotationGateway = {
    async getPublishedLetter(letterId) {
      const { data, error } = await supabase
        .from("letters")
        .select("id, author_id, letter_date, body_json, body_text")
        .eq("id", letterId)
        .eq("status", "published")
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: String(data.id),
        authorId: String(data.author_id),
        letterDate: String(data.letter_date),
        bodyJson: data.body_json,
        bodyText: data.body_text === null ? null : String(data.body_text),
      };
    },
    async insertAnnotation(annotation) {
      const { error } = await supabase.from("annotations").insert({
        letter_id: annotation.letterId,
        author_id: annotation.authorId,
        block_id: annotation.blockId,
        quoted_text: annotation.quotedText,
        start_offset: annotation.startOffset,
        end_offset: annotation.endOffset,
        comment: annotation.comment,
      });
      return error ? { ok: false, message: error.message } : { ok: true };
    },
    async createNotification(notification) {
      const { error } = await supabase.from("notifications").insert({
        recipient_id: notification.recipientId,
        type: "annotation",
        source_id: notification.letterId,
        title: notification.title,
        body: notification.body,
      });
      return error ? { ok: false, message: error.message } : { ok: true };
    },
  };

  const result = await createAnnotation(input, {
    userId,
    displayName: profile.display_name,
    gateway,
  });
  if (!result.ok) return result;

  revalidatePath(`/letters/${result.letterDate}`);
  return { ok: true, message: result.message };
}

export async function createAnnotationReplyAction(input: { annotationId: string; body: string }): Promise<ActionResult> {
  if (input === null || typeof input !== "object" ||
    typeof input.annotationId !== "string" || !UUID_PATTERN.test(input.annotationId) ||
    typeof input.body !== "string") {
    return { ok: false, message: "回复内容或评点编号无效。" };
  }
  const body = input.body.trim();
  if (!body || body.length > 2000) return { ok: false, message: "回复需要 1 到 2000 个字。" };

  const { userId, profile } = await requireUser();
  const supabase = await createServerSupabaseClient();

  const { data: annotation, error: annotationError } = await supabase
    .from("annotations")
    .select("id, author_id, letter_id, letters(letter_date, author_id, status)")
    .eq("id", input.annotationId)
    .single();

  if (annotationError || !annotation) return { ok: false, message: annotationError?.message ?? "没有找到这条评点。" };

  const letter = Array.isArray(annotation.letters) ? annotation.letters[0] : annotation.letters;
  if (!letter || String(letter.status) !== "published") {
    return { ok: false, message: "这封信当前无法回复评点。" };
  }

  const { error } = await supabase.from("annotation_replies").insert({
    annotation_id: input.annotationId,
    author_id: userId,
    body,
  });

  if (error) return { ok: false, message: error.message };

  const recipientId = String(annotation.author_id) === userId ? String(letter?.author_id) : String(annotation.author_id);

  if (recipientId && recipientId !== userId) {
    await supabase.from("notifications").insert({
      recipient_id: recipientId,
      type: "annotation_reply",
      source_id: String(annotation.letter_id),
      title: `${profile.display_name} 回复了评点`,
      body: body.slice(0, 80),
    });
  }

  revalidatePath(`/letters/${String(letter?.letter_date ?? "")}`);
  return { ok: true, message: "回复已发送。" };
}
