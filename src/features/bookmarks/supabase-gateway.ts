import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookmarkGateway } from "./core";

export function createBookmarkGateway(supabase: SupabaseClient, userId: string): BookmarkGateway {
  return {
    async getReadablePublishedLetter(letterId) {
      const { data, error } = await supabase
        .from("letters")
        .select("id, body_json, body_text")
        .eq("id", letterId)
        .eq("status", "published")
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: String(data.id),
        bodyJson: data.body_json,
        bodyText: data.body_text === null ? null : String(data.body_text),
      };
    },
    async findBookmark(identity) {
      let query = supabase
        .from("bookmarks")
        .select("id, owner_id, letter_id, kind, block_id, start_offset, end_offset, quoted_text")
        .eq("owner_id", userId)
        .eq("letter_id", identity.letterId)
        .eq("kind", identity.kind);
      query = identity.blockId === undefined ? query.is("block_id", null) : query.eq("block_id", identity.blockId);
      query = identity.startOffset === undefined ? query.is("start_offset", null) : query.eq("start_offset", identity.startOffset);
      query = identity.endOffset === undefined ? query.is("end_offset", null) : query.eq("end_offset", identity.endOffset);
      const { data, error } = await query.maybeSingle();
      if (error || !data) return null;
      return {
        id: String(data.id), ownerId: String(data.owner_id), letterId: String(data.letter_id),
        kind: data.kind === "excerpt" ? "excerpt" : "letter",
        blockId: data.block_id === null ? null : String(data.block_id),
        startOffset: data.start_offset === null ? null : Number(data.start_offset),
        endOffset: data.end_offset === null ? null : Number(data.end_offset),
        quotedText: data.quoted_text === null ? null : String(data.quoted_text),
      };
    },
    async insertBookmark(input) {
      const { error } = await supabase.from("bookmarks").insert({
        owner_id: userId,
        letter_id: input.letterId,
        kind: input.kind,
        block_id: input.blockId,
        start_offset: input.startOffset,
        end_offset: input.endOffset,
        quoted_text: input.quotedText,
      });
      return error ? { ok: false, code: error.code, message: error.message } : { ok: true };
    },
    async deleteBookmark(input) {
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("id", input.bookmarkId)
        .eq("owner_id", userId);
      return error ? { ok: false, message: error.message } : { ok: true };
    },
  };
}
