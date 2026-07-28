import type { SupabaseClient } from "@supabase/supabase-js";

export type LetterDraft = {
  id: string;
  spaceId: string;
  authorId: string;
  recipientId: string;
  richTextJson: { html?: string; text?: string } | null;
  plainText: string;
  moodEmoji: string | null;
  stationeryTheme: string;
  salutation: string | null;
  characterCount: number;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

function map(row: Row): LetterDraft {
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    authorId: String(row.author_id),
    recipientId: String(row.recipient_id),
    richTextJson: (row.rich_text_json as { html?: string; text?: string } | null) ?? null,
    plainText: String(row.plain_text ?? ""),
    moodEmoji: row.mood_emoji ? String(row.mood_emoji) : null,
    stationeryTheme: String(row.stationery_theme ?? "cream"),
    salutation: row.salutation ? String(row.salutation) : null,
    characterCount: Number(row.character_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getDraftByAuthor(
  client: Pick<SupabaseClient, "from">,
  authorId: string,
): Promise<LetterDraft | null> {
  const { data, error } = await client
    .from("journal_drafts")
    .select("id, space_id, author_id, recipient_id, rich_text_json, plain_text, mood_emoji, stationery_theme, salutation, character_count, created_at, updated_at")
    .eq("author_id", authorId)
    .maybeSingle();

  if (error) {
    console.error("getDraftByAuthor error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  if (!data) return null;
  return map(data as Row);
}

export async function upsertDraft(
  client: Pick<SupabaseClient, "rpc">,
  params: {
    spaceId: string;
    authorId: string;
    recipientId: string;
    richTextJson: { html?: string; text?: string } | null;
    plainText: string;
    moodEmoji: string | null;
    stationeryTheme: string;
    salutation: string | null;
    characterCount: number;
  },
): Promise<{ success: boolean; draftId: string | null }> {
  const { data, error } = await client.rpc("upsert_journal_draft", {
    p_space_id: params.spaceId,
    p_author_id: params.authorId,
    p_recipient_id: params.recipientId,
    p_rich_text_json: params.richTextJson,
    p_plain_text: params.plainText,
    p_mood_emoji: params.moodEmoji,
    p_stationery_theme: params.stationeryTheme,
    p_salutation: params.salutation,
    p_character_count: params.characterCount,
  });

  if (error) {
    console.error("upsertDraft error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { success: false, draftId: null };
  }

  const draftId = typeof data === "string" ? data : null;
  return { success: true, draftId };
}

export async function deleteDraft(
  client: Pick<SupabaseClient, "rpc">,
  authorId: string,
): Promise<boolean> {
  const { error } = await client.rpc("delete_journal_draft", {
    p_author_id: authorId,
  });

  if (error) {
    console.error("deleteDraft error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return false;
  }

  return true;
}
