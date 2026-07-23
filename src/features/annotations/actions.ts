"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";

export async function createAnnotationAction(input: {
  letterId: string;
  quotedText: string;
  startOffset: number;
  endOffset: number;
  comment: string;
}): Promise<ActionResult> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const quotedText = input.quotedText.trim();
  const comment = input.comment.trim();

  if (!quotedText) return { ok: false, message: "请先选中要评点的文字。" };
  if (!comment || comment.length > 2000) return { ok: false, message: "评点需要 1 到 2000 个字。" };

  const { data: letter, error: letterError } = await supabase
    .from("letters")
    .select("id, author_id, letter_date")
    .eq("id", input.letterId)
    .single();

  if (letterError || !letter) return { ok: false, message: letterError?.message ?? "没有找到这封信。" };

  const { data: annotation, error } = await supabase
    .from("annotations")
    .insert({
      letter_id: input.letterId,
      author_id: userId,
      quoted_text: quotedText,
      start_offset: input.startOffset,
      end_offset: input.endOffset,
      comment,
    })
    .select("id")
    .single();

  if (error || !annotation) return { ok: false, message: error?.message ?? "评点保存失败。" };

  if (String(letter.author_id) !== userId) {
    await supabase.rpc("create_legacy_notification", {
      p_kind: "annotation",
      p_source_id: String(annotation.id),
    });
  }

  revalidatePath(`/letters/${String(letter.letter_date)}`);
  return { ok: true, message: "评点已留下。" };
}

export async function createAnnotationReplyAction(input: { annotationId: string; body: string }): Promise<ActionResult> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const body = input.body.trim();

  if (!body || body.length > 2000) return { ok: false, message: "回复需要 1 到 2000 个字。" };

  const { data: annotation, error: annotationError } = await supabase
    .from("annotations")
    .select("id, author_id, letter_id, letters(letter_date, author_id)")
    .eq("id", input.annotationId)
    .single();

  if (annotationError || !annotation) return { ok: false, message: annotationError?.message ?? "没有找到这条评点。" };

  const { data: reply, error } = await supabase
    .from("letter_annotation_replies")
    .insert({
      annotation_id: input.annotationId,
      author_id: userId,
      body,
    })
    .select("id")
    .single();

  if (error || !reply) return { ok: false, message: error?.message ?? "回复保存失败。" };

  const letter = Array.isArray(annotation.letters) ? annotation.letters[0] : annotation.letters;
  const recipientId = String(annotation.author_id) === userId ? String(letter?.author_id) : String(annotation.author_id);

  if (recipientId && recipientId !== userId) {
    await supabase.rpc("create_legacy_notification", {
      p_kind: "annotation_reply",
      p_source_id: String(reply.id),
    });
  }

  revalidatePath(`/letters/${String(letter?.letter_date ?? "")}`);
  return { ok: true, message: "回复已发送。" };
}
