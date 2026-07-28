import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveFutureState, type FutureDiaryState, type JournalEntryType } from "./domain";

export const FUTURE_CARD_FIELDS =
  "id, author_id, recipient_id, sealed_at, open_at, opened_at, created_at";
export const FULL_ENTRY_FIELDS =
  "id, space_id, author_id, recipient_id, entry_type, title, content, rich_content, plain_text, excerpt, stationery_theme, mood_emoji, image_path, entry_date, published_at, updated_at, locked_at, sealed_at, open_at, opened_at, withdrawn_at, deleted_at, purge_at, star_at";

type JournalClient = Pick<SupabaseClient, "from" | "rpc">;
type FutureCardRow = {
  id: string;
  author_id: string;
  recipient_id: string;
  sealed_at: string;
  open_at: string;
  opened_at: string | null;
  created_at: string;
};

type FullEntryRow = {
  id: string;
  space_id: string;
  author_id: string;
  recipient_id: string | null;
  entry_type: JournalEntryType;
  title: string;
  content: string;
  rich_content?: { html?: string; text?: string } | null;
  plain_text?: string | null;
  excerpt?: string | null;
  stationery_theme?: string | null;
  mood_emoji?: string | null;
  withdrawn_at?: string | null;
  deleted_at?: string | null;
  purge_at?: string | null;
  star_at?: string | null;
  image_path: string | null;
  entry_date: string | null;
  published_at: string;
  updated_at: string;
  locked_at: string;
  sealed_at: string | null;
  open_at: string | null;
  opened_at: string | null;
};

export type FutureDiaryCard = {
  id: string;
  authorId: string;
  recipientId: string;
  sealedAt: string;
  openAt: string;
  openedAt: string | null;
  createdAt: string;
  state: FutureDiaryState;
};

export type JournalEntry = {
  id: string;
  spaceId: string;
  authorId: string;
  recipientId: string | null;
  entryType: JournalEntryType;
  title: string;
  content: string;
  richHtml: string | null;
  plainText: string;
  excerpt: string;
  stationeryTheme: string;
  moodEmoji: string | null;
  withdrawnAt: string | null;
  deletedAt: string | null;
  purgeAt: string | null;
  starAt: string | null;
  imagePath: string | null;
  entryDate: string | null;
  publishedAt: string;
  updatedAt: string;
  lockedAt: string;
  sealedAt: string | null;
  openAt: string | null;
  openedAt: string | null;
};

export type FutureDiaryRecipient = { id: string; displayName: string };

export async function listFutureDiaryCards(
  client: JournalClient,
  options: {
    userId: string;
    box: "received" | "sent";
    now?: Date;
  },
): Promise<FutureDiaryCard[]> {
  const { data, error } = await client.rpc("list_future_diary_cards", {
    p_box: options.box,
  });

  if (error) throw new Error("Unable to load future diary cards");

  return ((data ?? []) as FutureCardRow[])
    .filter((row) =>
      options.box === "received"
        ? row.recipient_id === options.userId
        : row.author_id === options.userId,
    )
    .map((row) => ({
      id: row.id,
      authorId: row.author_id,
      recipientId: row.recipient_id,
      sealedAt: row.sealed_at,
      openAt: row.open_at,
      openedAt: row.opened_at,
      createdAt: row.created_at,
      state: deriveFutureState(
        { openAt: row.open_at, openedAt: row.opened_at },
        options.now,
      ),
    }));
}

export async function getJournalEntry(
  client: JournalClient,
  entryId: string,
): Promise<JournalEntry | null> {
  const { data, error } = await client
    .from("journal_entries")
    .select(FULL_ENTRY_FIELDS)
    .eq("id", entryId)
    .maybeSingle();

  if (error) throw new Error("Unable to load journal entry");
  if (!data) return null;

  return mapFullEntry(data as FullEntryRow);
}

export async function listTodayDiaryEntries(client: JournalClient): Promise<JournalEntry[]> {
  const { data, error } = await client
    .from("journal_entries")
    .select(FULL_ENTRY_FIELDS)
    .eq("entry_type", "today")
    .order("published_at", { ascending: false });

  if (error) throw new Error("Unable to load journal entries");
  return ((data ?? []) as FullEntryRow[]).map(mapFullEntry);
}

export async function listSentFutureDiaryEntries(
  client: JournalClient,
  authorId: string,
): Promise<JournalEntry[]> {
  const { data, error } = await client
    .from("journal_entries")
    .select(FULL_ENTRY_FIELDS)
    .eq("entry_type", "future")
    .eq("author_id", authorId)
    .order("sealed_at", { ascending: false });

  if (error) throw new Error("Unable to load sent future diaries");
  return ((data ?? []) as FullEntryRow[]).map(mapFullEntry);
}

export async function getFutureDiaryRecipient(
  client: JournalClient,
  options: { spaceId: string; userId: string },
): Promise<FutureDiaryRecipient | null> {
  const { data: membership, error: membershipError } = await client
    .from("space_members")
    .select("user_id")
    .eq("space_id", options.spaceId)
    .eq("active", true)
    .neq("user_id", options.userId)
    .maybeSingle();

  if (membershipError) throw new Error("Unable to resolve future diary recipient");
  if (!membership) return null;

  const recipientId = (membership as { user_id: string }).user_id;
  
  // 获取对方的 display_name
  const { data: recipientProfile, error: recipientError } = await client
    .from("profiles")
    .select("id, display_name")
    .eq("id", recipientId)
    .single();

  if (recipientError || !recipientProfile) throw new Error("Unable to resolve future diary recipient");
  
  // 获取当前用户的 partner_nickname（我对 TA 的爱称）
  const { data: myProfile } = await client
    .from("profiles")
    .select("partner_nickname")
    .eq("id", options.userId)
    .single();

  const recipientRow = recipientProfile as { id: string; display_name: string };
  const myNickname = (myProfile as { partner_nickname?: string })?.partner_nickname;
  
  // 使用爱称，如果没有设置爱称则使用对方的用户名
  return { 
    id: recipientRow.id, 
    displayName: myNickname || recipientRow.display_name 
  };
}

function mapFullEntry(row: FullEntryRow): JournalEntry {
  return {
    id: row.id,
    spaceId: row.space_id,
    authorId: row.author_id,
    recipientId: row.recipient_id,
    entryType: row.entry_type,
    title: row.title,
    content: row.content,
    richHtml: row.rich_content?.html ?? null,
    plainText: row.plain_text ?? row.content,
    excerpt: row.excerpt ?? row.plain_text ?? row.content,
    stationeryTheme: row.stationery_theme ?? "cream",
    moodEmoji: row.mood_emoji ?? null,
    withdrawnAt: row.withdrawn_at ?? null,
    deletedAt: row.deleted_at ?? null,
    purgeAt: row.purge_at ?? null,
    starAt: row.star_at ?? null,
    imagePath: row.image_path,
    entryDate: row.entry_date,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    lockedAt: row.locked_at,
    sealedAt: row.sealed_at,
    openAt: row.open_at,
    openedAt: row.opened_at,
  };
}
