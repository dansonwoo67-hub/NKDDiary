"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { JournalActionResult } from "@/features/journal/actions";
import {
  JOURNAL_BODY_BLOCK_ID,
  countGraphemes,
  validateCommentBody,
  validateLongInteractionText,
} from "./rules";

const idSchema = z.string().uuid();
const COMMENT_WINDOW_MS = 4 * 60 * 60 * 1000;

export type JournalComment = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
};

export type AnnotationReply = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  canManage: boolean;
};

export type JournalAnnotation = {
  id: string;
  blockId: "body";
  startOffset: number;
  endOffset: number;
  quotedText: string;
  comment: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  canManage: boolean;
  replies: AnnotationReply[];
};

export type JournalInteractions = {
  comments: JournalComment[];
  annotations: JournalAnnotation[];
};

type ProfileJoin = { display_name?: string } | Array<{ display_name?: string }> | null;
type ReplyRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  profiles: ProfileJoin;
};
type AnnotationRow = {
  id: string;
  author_id: string;
  block_id: "body";
  start_offset: number;
  end_offset: number;
  quoted_text: string;
  comment: string;
  created_at: string;
  profiles: ProfileJoin;
  annotation_replies: ReplyRow[] | null;
};
type CommentRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  profiles: ProfileJoin;
};

function profileName(join: ProfileJoin) {
  const profile = Array.isArray(join) ? join[0] : join;
  return String(profile?.display_name ?? "对方");
}

function safeFailure(): JournalActionResult {
  return { ok: false, message: "操作失败，请稍后再试。" };
}

function revalidateEntry(entryId: string) {
  revalidatePath(`/journal/${entryId}`);
}

async function callMutation(
  entryId: string,
  rpcName: string,
  args: Record<string, unknown>,
  successMessage: string,
): Promise<JournalActionResult> {
  await requireUser();
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc(rpcName, args);
  if (error) return safeFailure();
  revalidateEntry(entryId);
  return { ok: true, message: successMessage, entryId };
}

export async function getJournalInteractions(entryId: string): Promise<JournalInteractions> {
  const parsedId = idSchema.safeParse(entryId);
  if (!parsedId.success) return { comments: [], annotations: [] };
  const { userId } = await requireUser();
  const client = await createServerSupabaseClient();
  const [commentsResult, annotationsResult] = await Promise.all([
    client
      .from("journal_comments")
      .select("id, author_id, body, created_at, updated_at, profiles:author_id(display_name)")
      .eq("entry_id", parsedId.data)
      .order("created_at", { ascending: true }),
    client
      .from("journal_annotations")
      .select("id, author_id, block_id, start_offset, end_offset, quoted_text, comment, created_at, profiles:author_id(display_name), annotation_replies(id, author_id, body, created_at, profiles:author_id(display_name))")
      .eq("entry_id", parsedId.data)
      .order("created_at", { ascending: true }),
  ]);
  if (commentsResult.error || annotationsResult.error) {
    throw new Error("Unable to load journal interactions");
  }

  const now = Date.now();
  const comments = (commentsResult.data ?? []) as unknown as CommentRow[];
  const annotations = (annotationsResult.data ?? []) as unknown as AnnotationRow[];
  return {
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorId: comment.author_id,
      authorName: profileName(comment.profiles),
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      canManage:
        comment.author_id === userId &&
        now <= new Date(comment.created_at).getTime() + COMMENT_WINDOW_MS,
    })),
    annotations: annotations.map((annotation) => ({
      id: annotation.id,
      blockId: annotation.block_id,
      startOffset: annotation.start_offset,
      endOffset: annotation.end_offset,
      quotedText: annotation.quoted_text,
      comment: annotation.comment,
      authorId: annotation.author_id,
      authorName: profileName(annotation.profiles),
      createdAt: annotation.created_at,
      canManage: annotation.author_id === userId,
      replies: (annotation.annotation_replies ?? [])
        .slice()
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
        .map((reply) => ({
          id: reply.id,
          body: reply.body,
          authorId: reply.author_id,
          authorName: profileName(reply.profiles),
          createdAt: reply.created_at,
          canManage: reply.author_id === userId,
        })),
    })),
  };
}

export async function createCommentAction(input: {
  entryId: string;
  body: string;
}): Promise<JournalActionResult> {
  const entryId = idSchema.safeParse(input.entryId);
  const body = validateCommentBody(input.body);
  if (!entryId.success) return safeFailure();
  if (!body.ok) return body;
  return callMutation(entryId.data, "create_journal_comment", {
    p_entry_id: entryId.data,
    p_body: body.value,
  }, "评论已发布。");
}

export async function updateCommentAction(input: {
  commentId: string;
  entryId: string;
  body: string;
}): Promise<JournalActionResult> {
  const ids = z.object({ commentId: idSchema, entryId: idSchema }).safeParse(input);
  const body = validateCommentBody(input.body);
  if (!ids.success) return safeFailure();
  if (!body.ok) return body;
  return callMutation(ids.data.entryId, "update_journal_comment", {
    p_comment_id: ids.data.commentId,
    p_body: body.value,
  }, "评论已更新。");
}

export async function deleteCommentAction(input: {
  commentId: string;
  entryId: string;
}): Promise<JournalActionResult> {
  const parsed = z.object({ commentId: idSchema, entryId: idSchema }).safeParse(input);
  if (!parsed.success) return safeFailure();
  return callMutation(parsed.data.entryId, "delete_journal_comment", {
    p_comment_id: parsed.data.commentId,
  }, "评论已删除。");
}

export async function createAnnotationAction(input: {
  entryId: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  quotedText: string;
  comment: string;
}): Promise<JournalActionResult> {
  const parsed = z.object({
    entryId: idSchema,
    blockId: z.literal(JOURNAL_BODY_BLOCK_ID),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().positive(),
    quotedText: z.string().min(1),
  }).safeParse(input);
  const comment = validateLongInteractionText(input.comment, "评注");
  if (!parsed.success || parsed.data.endOffset <= parsed.data.startOffset) return safeFailure();
  if (countGraphemes(parsed.data.quotedText) > 1_000) {
    return { ok: false, message: "选中文字不能超过 1000 个字符。" };
  }
  if (!comment.ok) return comment;
  return callMutation(parsed.data.entryId, "create_journal_annotation", {
    p_entry_id: parsed.data.entryId,
    p_block_id: parsed.data.blockId,
    p_start_offset: parsed.data.startOffset,
    p_end_offset: parsed.data.endOffset,
    p_quoted_text: parsed.data.quotedText,
    p_comment: comment.value,
  }, "评注已发布。");
}

export async function updateAnnotationAction(input: {
  annotationId: string;
  entryId: string;
  comment: string;
}): Promise<JournalActionResult> {
  const parsed = z.object({ annotationId: idSchema, entryId: idSchema }).safeParse(input);
  const comment = validateLongInteractionText(input.comment, "评注");
  if (!parsed.success) return safeFailure();
  if (!comment.ok) return comment;
  return callMutation(parsed.data.entryId, "update_journal_annotation", {
    p_annotation_id: parsed.data.annotationId,
    p_comment: comment.value,
  }, "评注已更新。");
}

export async function deleteAnnotationAction(input: {
  annotationId: string;
  entryId: string;
}): Promise<JournalActionResult> {
  const parsed = z.object({ annotationId: idSchema, entryId: idSchema }).safeParse(input);
  if (!parsed.success) return safeFailure();
  return callMutation(parsed.data.entryId, "delete_journal_annotation", {
    p_annotation_id: parsed.data.annotationId,
  }, "评注已删除。");
}

export async function createReplyAction(input: {
  annotationId: string;
  entryId: string;
  body: string;
}): Promise<JournalActionResult> {
  const parsed = z.object({ annotationId: idSchema, entryId: idSchema }).safeParse(input);
  const body = validateLongInteractionText(input.body, "回复");
  if (!parsed.success) return safeFailure();
  if (!body.ok) return body;
  return callMutation(parsed.data.entryId, "create_annotation_reply", {
    p_annotation_id: parsed.data.annotationId,
    p_body: body.value,
  }, "回复已发布。");
}

export async function updateReplyAction(input: {
  replyId: string;
  entryId: string;
  body: string;
}): Promise<JournalActionResult> {
  const parsed = z.object({ replyId: idSchema, entryId: idSchema }).safeParse(input);
  const body = validateLongInteractionText(input.body, "回复");
  if (!parsed.success) return safeFailure();
  if (!body.ok) return body;
  return callMutation(parsed.data.entryId, "update_annotation_reply", {
    p_reply_id: parsed.data.replyId,
    p_body: body.value,
  }, "回复已更新。");
}

export async function deleteReplyAction(input: {
  replyId: string;
  entryId: string;
}): Promise<JournalActionResult> {
  const parsed = z.object({ replyId: idSchema, entryId: idSchema }).safeParse(input);
  if (!parsed.success) return safeFailure();
  return callMutation(parsed.data.entryId, "delete_annotation_reply", {
    p_reply_id: parsed.data.replyId,
  }, "回复已删除。");
}
