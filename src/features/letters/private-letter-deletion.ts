import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { LetterMutationResult } from "./mutations";

const deletionInputSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
});

type PrivateLetterSnapshot = {
  id: string;
  status: "draft" | "scheduled" | "published" | "withdrawn";
  version: number;
  deletionToken: string | null;
};

type PreparedPrivateLetterDeletion = {
  token: string;
  paths: string[];
};

export type PrivateLetterDeletionGateway = {
  findOwnLetter(letterId: string, userId: string): Promise<PrivateLetterSnapshot | null>;
  findDetachedPaths(letterKey: string, userId: string): Promise<string[]>;
  prepare(
    letterId: string,
    expectedVersion: number,
  ): Promise<PreparedPrivateLetterDeletion | null>;
  removeObjects(paths: string[]): Promise<string | null>;
  finalize(letterId: string, deletionToken: string): Promise<boolean>;
};

export async function deletePrivateLetterWithAssets(
  gateway: PrivateLetterDeletionGateway,
  userId: string,
  input: { id: string; version: number },
): Promise<LetterMutationResult> {
  const parsed = deletionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "删除参数无效" };
  }

  let letter: PrivateLetterSnapshot | null;
  try {
    letter = await gateway.findOwnLetter(parsed.data.id, userId);
  } catch (error) {
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: error instanceof Error ? error.message : "无法读取这封信",
    };
  }
  if (!letter) {
    let detachedPaths: string[];
    try {
      detachedPaths = await gateway.findDetachedPaths(parsed.data.id, userId);
    } catch (error) {
      return {
        ok: false,
        code: "DATABASE_ERROR",
        message: error instanceof Error ? error.message : "无法检查待清理图片",
      };
    }
    if (detachedPaths.length === 0) return { ok: true, message: "私密信件已删除" };
    let cleanupError: string | null;
    try {
      cleanupError = await gateway.removeObjects(detachedPaths);
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : "存储暂时不可用";
    }
    return cleanupError
      ? {
          ok: false,
          code: "DATABASE_ERROR",
          message: `图片尚未删完：${cleanupError}，请重试`,
        }
      : { ok: true, message: "私密信件已删除" };
  }
  if (letter.status !== "draft" && letter.status !== "scheduled") {
    return { ok: false, code: "LETTER_LOCKED", message: "已发布的信不能删除" };
  }
  if (letter.version !== parsed.data.version && !letter.deletionToken) {
    return {
      ok: false,
      code: "VERSION_CONFLICT",
      message: "这封信已在另一处更新，请刷新后重试",
    };
  }

  let prepared: PreparedPrivateLetterDeletion | null;
  try {
    prepared = await gateway.prepare(letter.id, parsed.data.version);
  } catch (error) {
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: error instanceof Error ? error.message : "无法准备删除",
    };
  }
  if (!prepared) {
    return { ok: false, code: "VERSION_CONFLICT", message: "信件状态已变化，请刷新后重试" };
  }

  // Storage cleanup is opportunistic. Failed objects remain private and
  // tracked by detached tombstones after the parent letter is deleted.
  try {
    await gateway.removeObjects(prepared.paths);
  } catch {
    // A later authenticated cleanup pass uses the retained tombstones.
  }

  let finalized = false;
  try {
    finalized = await gateway.finalize(letter.id, prepared.token);
  } catch {
    finalized = false;
  }
  if (!finalized) {
    try {
      if (!(await gateway.findOwnLetter(letter.id, userId))) {
        return { ok: true, message: "私密信件已删除" };
      }
    } catch {
      // Normalize the uncertain result below so the user can retry safely.
    }
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: "删除尚未完成，请重试",
    };
  }
  return { ok: true, message: "私密信件已删除" };
}

export function createPrivateLetterDeletionGateway(
  supabase: SupabaseClient,
): PrivateLetterDeletionGateway {
  return {
    async findOwnLetter(letterId, userId) {
      const { data, error } = await supabase
        .from("letters")
        .select("id,status,version,deletion_token")
        .eq("id", letterId)
        .eq("author_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: String(data.id),
        status: String(data.status) as PrivateLetterSnapshot["status"],
        version: Number(data.version),
        deletionToken:
          typeof data.deletion_token === "string" ? data.deletion_token : null,
      };
    },
    async findDetachedPaths(letterKey, userId) {
      const { data, error } = await supabase
        .from("letter_assets")
        .select("storage_path")
        .eq("letter_key", letterKey)
        .eq("owner_id", userId)
        .is("letter_id", null)
        .eq("upload_status", "failed");
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((row) => row.storage_path)
        .filter((path): path is string => typeof path === "string");
    },
    async prepare(letterId, expectedVersion) {
      const { data, error } = await supabase.rpc("prepare_private_letter_deletion", {
        p_letter_id: letterId,
        p_expected_version: expectedVersion,
      });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      const token = "token" in data ? data.token : null;
      const paths = "paths" in data ? data.paths : null;
      if (typeof token !== "string" || !Array.isArray(paths)) return null;
      return {
        token,
        paths: paths.filter((path): path is string => typeof path === "string"),
      };
    },
    async removeObjects(paths) {
      if (paths.length === 0) return null;
      const { error } = await supabase.storage.from("letter-images").remove(paths);
      return error?.message ?? null;
    },
    async finalize(letterId, deletionToken) {
      const { data, error } = await supabase.rpc("finalize_private_letter_deletion", {
        p_letter_id: letterId,
        p_deletion_token: deletionToken,
      });
      return !error && data === true;
    },
  };
}
