import type { SupabaseClient } from "@supabase/supabase-js";

import type { LetterImageAsset, LetterImageGateway } from "./image-actions-core";

const BUCKET = "letter-images";

function asAsset(row: Record<string, unknown>): LetterImageAsset {
  return {
    id: String(row.id),
    letterId: typeof row.letter_id === "string" ? row.letter_id : null,
    ownerId: String(row.owner_id),
    storagePath: String(row.storage_path),
    mimeType: String(row.mime_type),
    width: Number(row.width),
    height: Number(row.height),
    sizeBytes: Number(row.size_bytes),
    uploadStatus: String(row.upload_status),
  };
}

function metadataNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createLetterImageGateway(supabase: SupabaseClient): LetterImageGateway {
  return {
    async findActiveLetter(letterId, userId, allowPublished = false) {
      const { data, error } = await supabase
        .from("letters")
        .select("id")
        .eq("id", letterId)
        .eq("author_id", userId)
        .in("status", allowPublished ? ["draft", "scheduled", "published"] : ["draft", "scheduled"])
        .is("deletion_token", null)
        .maybeSingle();
      return error || !data ? null : { id: String(data.id) };
    },

    async insertUploadingAsset(input) {
      const { data, error } = await supabase
        .from("letter_assets")
        .insert({
          letter_id: input.letterId,
          owner_id: input.ownerId,
          storage_path: input.storagePath,
          mime_type: input.mimeType,
          width: input.width,
          height: input.height,
          size_bytes: input.sizeBytes,
        })
        .select("id")
        .single();
      return error || !data ? null : { id: String(data.id) };
    },

    async markAssetFailed(assetId, _userId, path) {
      const { data, error } = await supabase.rpc("fail_letter_image_upload", {
        p_asset_id: assetId,
        p_storage_path: path,
      });
      return !error && data === true;
    },

    async findOwnedAsset(assetId, userId) {
      const { data, error } = await supabase
        .from("letter_assets")
        .select(
          "id,letter_id,owner_id,storage_path,mime_type,width,height,size_bytes,upload_status",
        )
        .eq("id", assetId)
        .eq("owner_id", userId)
        .maybeSingle();
      return error || !data ? null : asAsset(data as Record<string, unknown>);
    },

    async findStorageObject(path) {
      const parts = path.split("/");
      const filename = parts.pop();
      if (!filename || parts.length < 1) return null;
      const { data, error } = await supabase.storage.from(BUCKET).list(parts.join("/"), {
        limit: 2,
        search: filename,
      });
      if (error) return null;
      const object = data?.find((candidate) => candidate.name === filename);
      if (!object) return null;
      const metadata = (object.metadata ?? {}) as Record<string, unknown>;
      const mimeType = metadata.mimetype ?? metadata.contentType;
      return {
        name: object.name,
        sizeBytes: metadataNumber(metadata.size),
        mimeType: typeof mimeType === "string" ? mimeType.toLowerCase() : null,
      };
    },

    async markAssetReady(assetId, _userId, path) {
      const { data, error } = await supabase.rpc("complete_letter_image_upload", {
        p_asset_id: assetId,
        p_storage_path: path,
      });
      return !error && data === true;
    },

    async removeStorageObject(path) {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw new Error(error.message);
    },
  };
}
