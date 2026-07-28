"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const bodySchema = z.string().trim().min(1).max(200);
const idSchema = z.string().uuid();

function result(ok: boolean, message: string, data?: unknown) {
  return { ok, message, data };
}

function refresh(entryId: string) {
  revalidatePath("/");
  revalidatePath("/journal");
  revalidatePath(`/journal/${entryId}`);
}

export async function createCommentAction(entryId: unknown, body: unknown, parentId?: unknown) {
  const parsedId = idSchema.safeParse(entryId);
  const parsedBody = bodySchema.safeParse(body);
  const parsedParent = parentId !== undefined && parentId !== null ? idSchema.safeParse(parentId) : { success: true, data: undefined as string | undefined };

  if (!parsedId.success || !parsedBody.success || !parsedParent.success) {
    return result(false, "评论需要写点什么才能发送哦。");
  }

  await requireUser();
  const client = await createServerSupabaseClient();

  try {
    const { data, error } = await client.rpc("create_journal_comment_v2", {
      p_entry_id: parsedId.data,
      p_body: parsedBody.data,
      p_parent_id: parsedParent.data ?? null,
    });

    if (error) {
      console.error("createComment error:", error);
      return result(false, "评论刚刚没有发布成功，别担心，内容还在。稍后再试一次就好啦。");
    }

    refresh(parsedId.data);
    return result(true, "评论已发布。", data);
  } catch (error) {
    console.error("createComment exception:", error);
    return result(false, "评论刚刚没有发布成功，别担心，内容还在。稍后再试一次就好啦。");
  }
}

export async function updateCommentAction(commentId: unknown, body: unknown) {
  const parsedId = idSchema.safeParse(commentId);
  const parsedBody = bodySchema.safeParse(body);

  if (!parsedId.success || !parsedBody.success) {
    return result(false, "评论内容需要重新检查一下哦。");
  }

  await requireUser();
  const client = await createServerSupabaseClient();

  try {
    const { data, error } = await client.rpc("update_journal_comment_v2", {
      p_comment_id: parsedId.data,
      p_body: parsedBody.data,
    });

    if (error) {
      console.error("updateComment error:", error);
      return result(false, "这条评论已经不能修改了，可能已超过 24 小时。");
    }

    const { data: commentData } = await client
      .from("journal_comments")
      .select("entry_id")
      .eq("id", parsedId.data)
      .single();

    if (commentData?.entry_id) {
      refresh(commentData.entry_id);
    }

    return result(true, "评论已更新。", data);
  } catch (error) {
    console.error("updateComment exception:", error);
    return result(false, "评论修改没有成功，请稍后再试。");
  }
}

export async function withdrawCommentAction(commentId: unknown) {
  const parsedId = idSchema.safeParse(commentId);
  if (!parsedId.success) return result(false, "请稍等，好像出了点小问题。");

  await requireUser();
  const client = await createServerSupabaseClient();

  try {
    const { error } = await client.rpc("withdraw_journal_comment", {
      p_comment_id: parsedId.data,
    });

    if (error) {
      console.error("withdrawComment error:", error);
      return result(false, "这条评论已经不能撤回了，可能已超过 24 小时。");
    }

    const { data: commentData } = await client
      .from("journal_comments")
      .select("entry_id")
      .eq("id", parsedId.data)
      .single();

    if (commentData?.entry_id) {
      refresh(commentData.entry_id);
    }

    return result(true, "评论已撤回。");
  } catch (error) {
    console.error("withdrawComment exception:", error);
    return result(false, "撤回没有成功，请稍后再试。");
  }
}

export async function deleteCommentAction(commentId: unknown) {
  const parsedId = idSchema.safeParse(commentId);
  if (!parsedId.success) return result(false, "请稍等，好像出了点小问题。");

  await requireUser();
  const client = await createServerSupabaseClient();

  try {
    const { data: commentData } = await client
      .from("journal_comments")
      .select("entry_id")
      .eq("id", parsedId.data)
      .single();

    const { error } = await client.rpc("delete_journal_comment_v2", {
      p_comment_id: parsedId.data,
    });

    if (error) {
      console.error("deleteComment error:", error);
      return result(false, "这条评论已经不能删除了，可能已超过 24 小时。");
    }

    if (commentData?.entry_id) {
      refresh(commentData.entry_id);
    }

    return result(true, "评论已删除。");
  } catch (error) {
    console.error("deleteComment exception:", error);
    return result(false, "删除没有成功，请稍后再试。");
  }
}

export async function getCommentsAction(entryId: unknown) {
  const parsedId = idSchema.safeParse(entryId);
  if (!parsedId.success) return { comments: [], error: "无效的信件 ID。" };

  try {
    await requireUser();
    const client = await createServerSupabaseClient();

    const { data, error } = await client
      .from("journal_comments")
      .select(`
        id,
        entry_id,
        author_id,
        parent_id,
        body,
        created_at,
        updated_at,
        editable_until,
        withdrawn_at,
        profiles:author_id (display_name, avatar_url)
      `)
      .eq("entry_id", parsedId.data)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("getComments error:", error);
      return { comments: [], error: "加载评论失败。" };
    }

    return { comments: data || [], error: null };
  } catch (error) {
    console.error("getComments exception:", error);
    return { comments: [], error: "加载评论失败。" };
  }
}
