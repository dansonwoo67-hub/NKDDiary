import { canWithdrawLetter } from "@/features/letters/lifecycle";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PersonalContentPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type PersonalSortableRow = {
  id: string;
  timestamp: string;
};

type PageOptions = {
  limit?: number;
  cursor?: string | null;
};

type DecodedCursor = {
  timestamp: string;
  id: string;
};

export type PersonalLetterItem = {
  id: string;
  kind: "daily" | "time_capsule";
  letterDate: string;
  salutation: string;
  finalLine: string;
  bodyText: string;
  publishedAt: string;
  canWithdraw: boolean;
  href: string;
  version: number;
};

export type PersonalDraftItem = {
  id: string;
  kind: "daily" | "time_capsule";
  letterDate: string;
  salutation: string;
  finalLine: string;
  bodyText: string;
  updatedAt: string;
  version: number;
};

export type PersonalFutureItem = PersonalDraftItem & {
  scheduledFor: string;
};

export type PersonalCommentItem = {
  id: string;
  quotedText: string;
  comment: string;
  letterDate: string | null;
  letterStatus: string | null;
  createdAt: string;
  replies: Array<{ id: string; body: string; authorName: string }>;
  href: string | null;
};

export type PersonalBookmarkItem = {
  id: string;
  kind: "letter" | "excerpt";
  quotedText: string | null;
  letterDate: string | null;
  letterStatus: string | null;
  createdAt: string;
  href: string | null;
};

export type PersonalEventItem = {
  id: string;
  name: string;
  eventDate: string;
  recurrence: "none" | "monthly" | "yearly";
  icon: string;
  color: "rose" | "gold" | "blue" | "green" | "purple";
  createdAt: string;
};

export function clampPersonalLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(20, Math.max(1, Math.floor(Number(limit))));
}

export function buildCursor(timestamp: string, id: string) {
  return encodeURIComponent(JSON.stringify({ timestamp, id }));
}

export function decodeCursor(cursor: string | null | undefined): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(cursor)) as Partial<DecodedCursor>;
    if (typeof parsed.timestamp !== "string" || typeof parsed.id !== "string") return null;
    if (!Number.isFinite(Date.parse(parsed.timestamp)) || parsed.id.length === 0) return null;
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    return null;
  }
}

export function pageSortedRows<T extends PersonalSortableRow>(
  rows: T[],
  options: { limit: number; cursor: string | null },
): PersonalContentPage<T> {
  const cursor = decodeCursor(options.cursor);
  const sorted = [...rows].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id)
  );
  const afterCursor = cursor
    ? sorted.filter((row) => row.timestamp < cursor.timestamp || (row.timestamp === cursor.timestamp && row.id < cursor.id))
    : sorted;
  const limited = afterCursor.slice(0, options.limit + 1);
  const items = limited.slice(0, options.limit);
  const next = limited.length > options.limit ? items.at(-1) : null;
  return {
    items,
    nextCursor: next ? buildCursor(next.timestamp, next.id) : null,
  };
}

function applyCursor<TQuery extends { or: (filter: string) => TQuery }>(
  query: TQuery,
  column: string,
  cursor: string | null | undefined,
) {
  const decoded = decodeCursor(cursor);
  if (!decoded) return query;
  return query.or(`${column}.lt.${decoded.timestamp},and(${column}.eq.${decoded.timestamp},id.lt.${decoded.id})`);
}

function paged<T extends { id: string }>(
  rows: T[],
  limit: number,
  timestamp: (row: T) => string,
): PersonalContentPage<T> {
  const items = rows.slice(0, limit);
  const next = rows.length > limit ? items.at(-1) : null;
  return {
    items,
    nextCursor: next ? buildCursor(timestamp(next), next.id) : null,
  };
}

function text(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function letterHref(date: string | null) {
  return date ? `/letters/${date}` : null;
}

export async function getMyPublishedLetters(options: PageOptions = {}): Promise<PersonalContentPage<PersonalLetterItem>> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const limit = clampPersonalLimit(options.limit);
  let query = supabase
    .from("letters")
    .select("id, kind, version, letter_date, salutation, body_text, seven_char_line, published_at")
    .eq("author_id", userId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  query = applyCursor(query, "published_at", options.cursor);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => {
    const publishedAt = text(row.published_at);
    const date = text(row.letter_date);
    return {
      id: text(row.id),
      kind: row.kind === "time_capsule" ? "time_capsule" as const : "daily" as const,
      letterDate: date,
      salutation: text(row.salutation, "亲爱的"),
      finalLine: text(row.seven_char_line),
      bodyText: text(row.body_text),
      publishedAt,
      canWithdraw: publishedAt ? canWithdrawLetter(publishedAt) : false,
      href: `/letters/${date}`,
      version: Number(row.version ?? 1),
    };
  });
  return paged(items, limit, (item) => item.publishedAt);
}

export async function getMyDrafts(options: PageOptions = {}): Promise<PersonalContentPage<PersonalDraftItem>> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const limit = clampPersonalLimit(options.limit);
  let query = supabase
    .from("letters")
    .select("id, kind, version, letter_date, salutation, body_text, seven_char_line, updated_at")
    .eq("author_id", userId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  query = applyCursor(query, "updated_at", options.cursor);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => ({
    id: text(row.id),
    kind: row.kind === "time_capsule" ? "time_capsule" as const : "daily" as const,
    letterDate: text(row.letter_date),
    salutation: text(row.salutation, "亲爱的"),
    finalLine: text(row.seven_char_line),
    bodyText: text(row.body_text),
    updatedAt: text(row.updated_at),
    version: Number(row.version ?? 1),
  }));
  return paged(items, limit, (item) => item.updatedAt);
}

export async function getMyFutureLetters(options: PageOptions = {}): Promise<PersonalContentPage<PersonalFutureItem>> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const limit = clampPersonalLimit(options.limit);
  let query = supabase
    .from("letters")
    .select("id, kind, version, letter_date, salutation, body_text, seven_char_line, scheduled_for, updated_at")
    .eq("author_id", userId)
    .eq("status", "scheduled")
    .order("scheduled_for", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  query = applyCursor(query, "scheduled_for", options.cursor);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => ({
    id: text(row.id),
    kind: "time_capsule" as const,
    letterDate: text(row.letter_date),
    salutation: text(row.salutation, "亲爱的"),
    finalLine: text(row.seven_char_line),
    bodyText: text(row.body_text),
    updatedAt: text(row.updated_at),
    scheduledFor: text(row.scheduled_for),
    version: Number(row.version ?? 1),
  }));
  return paged(items, limit, (item) => item.scheduledFor);
}

export async function getMyComments(options: PageOptions = {}): Promise<PersonalContentPage<PersonalCommentItem>> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const limit = clampPersonalLimit(options.limit);
  let query = supabase
    .from("annotations")
    .select("id, quoted_text, comment, created_at, letters:letter_id(letter_date,status), annotation_replies(id, body, profiles:author_id(display_name))")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  query = applyCursor(query, "created_at", options.cursor);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => {
    const letter = relationOne(row.letters);
    const replies = Array.isArray(row.annotation_replies) ? row.annotation_replies : [];
    const date = letter ? text(letter.letter_date) : null;
    return {
      id: text(row.id),
      quotedText: text(row.quoted_text),
      comment: text(row.comment),
      letterDate: date,
      letterStatus: letter ? text(letter.status) : null,
      createdAt: text(row.created_at),
      replies: replies.map((reply) => {
        const profile = relationOne(reply.profiles);
        return {
          id: text(reply.id),
          body: text(reply.body),
          authorName: profile ? text(profile.display_name, "对方") : "对方",
        };
      }),
      href: letterHref(date),
    };
  });
  return paged(items, limit, (item) => item.createdAt);
}

export async function getMyBookmarks(options: PageOptions = {}): Promise<PersonalContentPage<PersonalBookmarkItem>> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const limit = clampPersonalLimit(options.limit);
  let query = supabase
    .from("bookmarks")
    .select("id, kind, quoted_text, created_at, letters:letter_id(letter_date,status)")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  query = applyCursor(query, "created_at", options.cursor);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => {
    const letter = relationOne(row.letters);
    const date = letter ? text(letter.letter_date) : null;
    return {
      id: text(row.id),
      kind: row.kind === "excerpt" ? "excerpt" as const : "letter" as const,
      quotedText: row.quoted_text === null ? null : text(row.quoted_text),
      letterDate: date,
      letterStatus: letter ? text(letter.status) : null,
      createdAt: text(row.created_at),
      href: letterHref(date),
    };
  });
  return paged(items, limit, (item) => item.createdAt);
}

export async function getMyEvents(options: PageOptions = {}): Promise<PersonalContentPage<PersonalEventItem>> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const limit = clampPersonalLimit(options.limit);
  let query = supabase
    .from("calendar_events")
    .select("id, name, event_date, recurrence, icon, color, created_at")
    .eq("creator_id", userId)
    .order("event_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  query = applyCursor(query, "event_date", options.cursor);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => ({
    id: text(row.id),
    name: text(row.name),
    eventDate: text(row.event_date),
    recurrence: row.recurrence === "monthly" || row.recurrence === "yearly" ? row.recurrence : "none",
    icon: text(row.icon, "🌹"),
    color: (["rose", "gold", "blue", "green", "purple"].includes(text(row.color)) ? row.color : "rose") as PersonalEventItem["color"],
    createdAt: text(row.created_at),
  }));
  return paged(items, limit, (item) => item.eventDate);
}
