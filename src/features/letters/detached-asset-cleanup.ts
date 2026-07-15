import type { SupabaseClient } from "@supabase/supabase-js";

export type DetachedAssetCleanupGateway = {
  listPaths(userId: string): Promise<string[]>;
  removeObjects(paths: string[]): Promise<string | null>;
};

export async function cleanupDetachedLetterAssets(
  gateway: DetachedAssetCleanupGateway,
  userId: string,
): Promise<{ ok: boolean }> {
  let paths: string[];
  try {
    paths = await gateway.listPaths(userId);
  } catch {
    return { ok: false };
  }
  if (paths.length === 0) return { ok: true };
  try {
    return { ok: (await gateway.removeObjects(paths)) === null };
  } catch {
    return { ok: false };
  }
}

export function createDetachedAssetCleanupGateway(
  supabase: SupabaseClient,
): DetachedAssetCleanupGateway {
  return {
    async listPaths(userId) {
      const { data, error } = await supabase
        .from("letter_assets")
        .select("storage_path")
        .eq("owner_id", userId)
        .eq("upload_status", "failed");
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((row) => row.storage_path)
        .filter((path): path is string => typeof path === "string");
    },
    async removeObjects(paths) {
      if (paths.length === 0) return null;
      const { error } = await supabase.storage.from("letter-images").remove(paths);
      return error?.message ?? null;
    },
  };
}
