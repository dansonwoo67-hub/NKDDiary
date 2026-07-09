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
  const { userId, profile } = await requireUser();
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

  const { error } = await supabase.from("annotations").insert({
    letter_id: input.letterId,
    author_id: userId,
    quoted_text: quotedText,
    start_offset: input.startOffset,
    end_offset: input.endOffset,
    comment,
  });

  if (error) return { ok: false, message: error.message };

  if (String(letter.author_id) !== userId) {
    await supabase.from("notifications").insert({
      recipient_id: String(letter.author_id),
      type: "annotation",
      source_id: input.letterId,
      title: `${profile.display_name} 评点了你的信`,
      body: quotedText.slice(0, 60),
    });
  }

  revalidatePath(`/letters/${String(letter.letter_date)}`);
  return { ok: true, message: "评点已留下。" };
}

export async function createAnnotationReplyAction(input: { annotationId: string; body: string }): Promise<ActionResult> {
  const { userId, profile } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const body = input.body.trim();

  if (!body || body.length > 2000) return { ok: false, message: "回复需要 1 到 2000 个字。" };

  const { data: annotation, error: annotationError } = await supabase
    .from("annotations")
    .select("id, author_id, letter_id, letters(letter_date, author_id)")
    .eq("id", input.annotationId)
    .single();

  if (annotationError || !annotation) return { ok: false, message: annotationError?.message ?? "没有找到这条评点。" };

  const { error } = await supabase.from("annotation_replies").insert({
    annotation_id: input.annotationId,
    author_id: userId,
    body,
  });

  if (error) return { ok: false, message: error.message };

  const letter = Array.isArray(annotation.letters) ? annotation.letters[0] : annotation.letters;
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
