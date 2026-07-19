import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveFutureState, type FutureDiaryState, type JournalEntryType } from "./domain";

export const FUTURE_CARD_FIELDS =
  "id, author_id, recipient_id, sealed_at, open_at, opened_at, created_at";
export const FULL_ENTRY_FIELDS =
  "id, space_id, author_id, recipient_id, entry_type, title, content, image_path, entry_date, published_at, updated_at, locked_at, sealed_at, open_at, opened_at";

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
  imagePath: string | null;
  entryDate: string | null;
  publishedAt: string;
  updatedAt: string;
  lockedAt: string;
  sealedAt: string | null;
  openAt: string | null;
  openedAt: string | null;
};

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

function mapFullEntry(row: FullEntryRow): JournalEntry {
  return {
    id: row.id,
    spaceId: row.space_id,
    authorId: row.author_id,
    recipientId: row.recipient_id,
    entryType: row.entry_type,
    title: row.title,
    content: row.content,
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
