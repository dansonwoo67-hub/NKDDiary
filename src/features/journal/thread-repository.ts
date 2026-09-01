import type { SupabaseClient } from "@supabase/supabase-js";

type RpcClient = Pick<SupabaseClient, "rpc">;
type Row = Record<string, unknown>;

export type LetterThreadSummary = {
  threadId: string;
  counterpartId: string;
  latestActivityAt: string;
  latestLetterId: string;
  latestPreview: string;
  letterCount: number;
  originType: "today" | "future";
  rootOpenAt: string | null;
  rootOpenedAt: string | null;
  latestWithdrawn: boolean;
  unread: boolean;
};

export type LetterThreadDetailItem = {
  threadId: string;
  letterId: string;
  replyToId: string | null;
  authorId: string;
  recipientId: string;
  entryType: "today" | "future";
  publishedAt: string;
  openAt: string | null;
  openedAt: string | null;
  withdrawnAt: string | null;
  bodyVisible: boolean;
  title: string | null;
  richContent: Record<string, unknown> | null;
  plainText: string | null;
  excerpt: string | null;
  stationeryTheme: string | null;
  moodEmoji: string | null;
  imagePath: string | null;
  replyAllowed: boolean;
  resendAllowed: boolean;
  threadCount: number;
};

export async function listLetterThreads(
  client: RpcClient,
  options: { limit?: number; beforeActivityAt?: string; beforeThreadId?: string } = {},
): Promise<LetterThreadSummary[]> {
  const { data, error } = await client.rpc("list_letter_threads", {
    p_limit: options.limit ?? 30,
    p_before_activity_at: options.beforeActivityAt ?? null,
    p_before_thread_id: options.beforeThreadId ?? null,
  });
  if (error) throw new Error("Unable to load letter threads");
  return ((data ?? []) as Row[]).map((row) => ({
    threadId: String(row.thread_id),
    counterpartId: String(row.counterpart_id),
    latestActivityAt: String(row.latest_activity_at),
    latestLetterId: String(row.latest_letter_id),
    latestPreview: String(row.latest_preview ?? ""),
    letterCount: Number(row.letter_count),
    originType: String(row.origin_type) as "today" | "future",
    rootOpenAt: row.root_open_at ? String(row.root_open_at) : null,
    rootOpenedAt: row.root_opened_at ? String(row.root_opened_at) : null,
    latestWithdrawn: Boolean(row.latest_withdrawn),
    unread: Boolean(row.unread),
  }));
}

export async function getLetterThreadDetail(client: RpcClient, threadId: string): Promise<LetterThreadDetailItem[]> {
  const { data, error } = await client.rpc("get_letter_thread_detail", { p_thread_id: threadId });
  if (error) throw new Error("Unable to load letter thread");
  return ((data ?? []) as Row[]).map((row) => ({
    threadId: String(row.thread_id),
    letterId: String(row.letter_id),
    replyToId: row.reply_to_id ? String(row.reply_to_id) : null,
    authorId: String(row.author_id),
    recipientId: String(row.recipient_id),
    entryType: String(row.entry_type) as "today" | "future",
    publishedAt: String(row.published_at),
    openAt: row.open_at ? String(row.open_at) : null,
    openedAt: row.opened_at ? String(row.opened_at) : null,
    withdrawnAt: row.withdrawn_at ? String(row.withdrawn_at) : null,
    bodyVisible: Boolean(row.body_visible),
    title: row.title === null ? null : String(row.title),
    richContent: row.rich_content as Record<string, unknown> | null,
    plainText: row.plain_text === null ? null : String(row.plain_text),
    excerpt: row.excerpt === null ? null : String(row.excerpt),
    stationeryTheme: row.stationery_theme === null ? null : String(row.stationery_theme),
    moodEmoji: row.mood_emoji === null ? null : String(row.mood_emoji),
    imagePath: row.image_path === null ? null : String(row.image_path),
    replyAllowed: Boolean(row.reply_allowed),
    resendAllowed: Boolean(row.resend_allowed),
    threadCount: Number(row.thread_count),
  }));
}
