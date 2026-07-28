import type { SupabaseClient } from "@supabase/supabase-js";
import { getMostRecentOccurrence, type CalendarRecurrence } from "@/features/calendar/recurrence";
import { calendarBelongsInMemories, type CalendarMemoryType } from "@/features/memories/rules";
import { getChinaDateString } from "@/lib/date/china-day";

type MoodRow = {
  id: string;
  body: string;
  emoji: string;
  author_id: string;
  created_at: string;
  author_name_snapshot: string | null;
  author_avatar_snapshot: string | null;
};

type IndependentMemoryRow = {
  id: string;
  title: string;
  body: string;
  occurred_on: string;
  image_path: string | null;
  author_id: string;
  created_at: string;
  author_name_snapshot: string | null;
  author_avatar_snapshot: string | null;
};

type EventRow = {
  id: string;
  name: string;
  icon: string;
  event_date: string;
  recurrence: CalendarRecurrence;
  event_type: CalendarMemoryType;
  is_important: boolean;
  creator_id: string;
  creator_name_snapshot: string | null;
  creator_avatar_snapshot: string | null;
};

export type MemoryFeedKind = "mood" | "memory" | "calendar";

export type MemoryItem = {
  id: string;
  kind: MemoryFeedKind;
  title: string;
  description?: string;
  occurredAt: string;
  authorId?: string;
  authorName?: string;
  authorAvatarUrl?: string | null;
  createdAt?: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  href?: string;
};

export function buildMemoryFeed(input: {
  memories: IndependentMemoryRow[];
  moods: MoodRow[];
  events: EventRow[];
  today?: string;
}): MemoryItem[] {
  const memories = input.memories.map((row) => ({
    id: row.id,
    kind: "memory" as const,
    title: row.title,
    description: row.body,
    occurredAt: `${row.occurred_on}T12:00:00+08:00`,
    authorId: row.author_id,
    createdAt: row.created_at,
    imagePath: row.image_path,
    authorName: row.author_name_snapshot ?? undefined,
    authorAvatarUrl: row.author_avatar_snapshot,
  }));
  const moods = input.moods.map((row) => ({
    id: row.id,
    kind: "mood" as const,
    title: [row.emoji, row.body].filter(Boolean).join(" "),
    occurredAt: row.created_at,
    createdAt: row.created_at,
    authorId: row.author_id,
    href: "/mood",
    authorName: row.author_name_snapshot ?? undefined,
    authorAvatarUrl: row.author_avatar_snapshot,
  }));
  const today = input.today ?? getChinaDateString();
  const events = input.events.flatMap((row) => {
    if (!calendarBelongsInMemories(row.event_type, row.is_important)) return [];
    const occurredOn = getMostRecentOccurrence(row.event_date, row.recurrence, today);
    return occurredOn
      ? [{
          id: row.id,
          kind: "calendar" as const,
          title: `${row.icon} ${row.name}`,
          occurredAt: `${occurredOn}T00:00:00+08:00`,
          href: "/calendar",
          authorId: row.creator_id,
          authorName: row.creator_name_snapshot ?? undefined,
          authorAvatarUrl: row.creator_avatar_snapshot,
        }]
      : [];
  });
  return [...memories, ...moods, ...events].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}

export async function listMemories(client: SupabaseClient, spaceId: string) {
  const [memories, moods, events, profiles] = await Promise.all([
    client.from("memory_entries")
      .select("id, title, body, occurred_on, image_path, author_id, created_at, author_name_snapshot, author_avatar_snapshot")
      .eq("space_id", spaceId),
    client.from("mood_entries")
      .select("id, body, emoji, author_id, created_at, author_name_snapshot, author_avatar_snapshot")
      .eq("space_id", spaceId),
    client.from("calendar_events")
      .select("id, name, icon, event_date, recurrence, event_type, is_important, creator_id, creator_name_snapshot, creator_avatar_snapshot")
      .eq("space_id", spaceId),
    client.from("profiles")
      .select("id, display_name, avatar_url"),
  ]);
  if (memories.error || moods.error || events.error) throw new Error("Unable to load memories");

  type ProfileRow = { id: string; display_name: string | null; avatar_url: string | null };
  const profileMap = new Map((profiles.data ?? [] as ProfileRow[]).map(profile => [String(profile.id), profile]));
  const feed = buildMemoryFeed({
    memories: (memories.data ?? []) as IndependentMemoryRow[],
    moods: (moods.data ?? []) as MoodRow[],
    events: (events.data ?? []) as EventRow[],
    today: getChinaDateString(),
  });

  return Promise.all(feed.map(async (item) => {
    const profile = item.authorId ? profileMap.get(item.authorId) : null;
    const enriched = {
      ...item,
      authorName: item.authorName ?? profile?.display_name ?? (item.kind === "calendar" ? "我们" : "未知"),
      authorAvatarUrl: item.authorAvatarUrl ?? profile?.avatar_url ?? null,
    };
    if (item.kind !== "memory" || !item.imagePath) return enriched;
    const { data, error } = await client.storage.from("memory-images").createSignedUrl(item.imagePath, 300);
    return { ...enriched, imageUrl: error ? null : data.signedUrl };
  }));
}
