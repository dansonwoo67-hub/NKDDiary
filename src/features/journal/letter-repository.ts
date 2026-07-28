import type { SupabaseClient } from "@supabase/supabase-js";

export const JOURNAL_LETTER_SELECT =
  "id, space_id, author_id, recipient_id, entry_type, title, content, rich_content, plain_text, excerpt, stationery_theme, mood_emoji, image_path, entry_date, published_at, created_at, updated_at, locked_at, sealed_at, open_at, opened_at, withdrawn_at, deleted_at, purge_at, star_at";

type Row = Record<string, unknown>;
export type LetterListItem = {
  id: string;
  spaceId: string;
  authorId: string;
  recipientId: string | null;
  entryType: string;
  title: string;
  excerpt: string;
  stationeryTheme: string;
  moodEmoji: string | null;
  imagePath: string | null;
  entryDate: string | null;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  lockedAt: string;
  sealedAt: string | null;
  openAt: string | null;
  openedAt: string | null;
  withdrawnAt: string | null;
  deletedAt: string | null;
  purgeAt: string | null;
  starAt: string | null;
  commentCount: number;
};

function map(row: Row): LetterListItem {
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    authorId: String(row.author_id),
    recipientId: row.recipient_id ? String(row.recipient_id) : null,
    entryType: String(row.entry_type),
    title: String(row.title ?? ""),
    excerpt: String(row.excerpt ?? row.plain_text ?? row.content ?? ""),
    stationeryTheme: String(row.stationery_theme ?? "cream"),
    moodEmoji: row.mood_emoji ? String(row.mood_emoji) : null,
    imagePath: row.image_path ? String(row.image_path) : null,
    entryDate: row.entry_date ? String(row.entry_date) : null,
    publishedAt: String(row.published_at ?? row.created_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lockedAt: String(row.locked_at),
    sealedAt: row.sealed_at ? String(row.sealed_at) : null,
    openAt: row.open_at ? String(row.open_at) : null,
    openedAt: row.opened_at ? String(row.opened_at) : null,
    withdrawnAt: row.withdrawn_at ? String(row.withdrawn_at) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    purgeAt: row.purge_at ? String(row.purge_at) : null,
    starAt: row.star_at ? String(row.star_at) : null,
    commentCount: Number(row.comment_count ?? 0),
  };
}

export async function listLetterBoxes(client: Pick<SupabaseClient, "from" | "rpc">, userId: string) {
  // Get regular letters (entry_type = 'today') - require published_at
  const { data: regularData, error: regularError } = await client
    .from("journal_entries")
    .select(JOURNAL_LETTER_SELECT)
    .eq("entry_type", "today")
    .or(`author_id.eq.${userId},recipient_id.eq.${userId}`)
    .not("recipient_id", "is", null)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  if (regularError) {
    console.error("listLetterBoxes (regular) query error:", {
      message: regularError.message,
      code: regularError.code,
      details: regularError.details,
    });
    throw new Error(
      `Unable to load letters: ${regularError.code ?? "unknown"} ${regularError.message}`
    );
  }

  // Get capsule letters (entry_type = 'future') - scheduled or sent
  const { data: capsuleData, error: capsuleError } = await client
    .from("journal_entries")
    .select(JOURNAL_LETTER_SELECT)
    .eq("entry_type", "future")
    .or(`author_id.eq.${userId},recipient_id.eq.${userId}`)
    .not("recipient_id", "is", null)
    .order("published_at", { ascending: false });

  if (capsuleError) {
    console.error("listLetterBoxes (capsule) query error:", {
      message: capsuleError.message,
      code: capsuleError.code,
      details: capsuleError.details,
    });
    throw new Error(
      `Unable to load capsule letters: ${capsuleError.code ?? "unknown"} ${capsuleError.message}`
    );
  }

  // Combine and deduplicate results
  const seen = new Set<string>();
  const allRows: Row[] = [];

  for (const r of [...(regularData ?? []), ...(capsuleData ?? [])]) {
    const id = String(r.id);
    if (!seen.has(id)) {
      seen.add(id);
      allRows.push(r);
    }
  }

  // Load comment counts
  const commentCounts: Record<string, number> = {};
  if (allRows.length > 0) {
    try {
      const { data: commentsData } = await client
        .from("journal_comments")
        .select("entry_id")
        .in("entry_id", allRows.map(r => String(r.id)))
        .is("deleted_at", null);

      if (commentsData) {
        for (const c of commentsData) {
          const eid = String((c as Row).entry_id);
          commentCounts[eid] = (commentCounts[eid] || 0) + 1;
        }
      }
    } catch (e) {
      console.warn("Failed to load comment counts:", e);
    }
  }

  const all = allRows
    .map((r) => {
      const id = String(r.id);
      const raw = map(r);
      return { ...raw, commentCount: commentCounts[id] || 0 };
    })
    .sort((a, b) =>
      new Date(b.publishedAt ?? b.createdAt).getTime() -
      new Date(a.publishedAt ?? a.createdAt).getTime()
    );

  return {
    // Sent: all letters authored by this user (including withdrawn ones)
    sent: all.filter((x) => x.authorId === userId),
    // Inbox: recipient's letters that are NOT withdrawn
    inbox: all.filter((x) => x.recipientId === userId && !x.withdrawnAt),
    // Starred: starred letters
    starred: all.filter((x) => x.starAt !== null),
  };
}
