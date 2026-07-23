import type { SupabaseClient } from "@supabase/supabase-js";

export const JOURNAL_MEMORY_FIELDS = "id, entry_type, title, published_at, opened_at";

type JournalRow = { id: string; entry_type: "today" | "future"; title: string; published_at: string; opened_at: string | null };
type MoodRow = { id: string; body: string; emoji: string; created_at: string };
type EventRow = { id: string; name: string; icon: string; event_date: string };
export type MemoryItem = { id: string; kind: "journal" | "mood" | "calendar"; title: string; occurredAt: string; href?: string };

export function buildMemoryFeed(input: { journals: JournalRow[]; moods: MoodRow[]; events: EventRow[] }): MemoryItem[] {
  const journals = input.journals.flatMap((row) => {
    if (row.entry_type === "future" && !row.opened_at) return [];
    return [{ id: row.id, kind: "journal" as const, title: row.title, occurredAt: row.opened_at ?? row.published_at, href: `/journal/${row.id}` }];
  });
  const moods = input.moods.map((row) => ({ id: row.id, kind: "mood" as const, title: `${row.emoji} ${row.body}`.trim(), occurredAt: row.created_at }));
  const events = input.events.map((row) => ({ id: row.id, kind: "calendar" as const, title: `${row.icon} ${row.name}`, occurredAt: `${row.event_date}T00:00:00+08:00`, href: "/calendar" }));
  return [...journals, ...moods, ...events].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

export async function listMemories(client: Pick<SupabaseClient, "from">, spaceId: string) {
  const [journals, moods, events] = await Promise.all([
    client.from("journal_entries").select(JOURNAL_MEMORY_FIELDS).eq("space_id", spaceId)
      .or("entry_type.eq.today,and(entry_type.eq.future,opened_at.not.is.null)"),
    client.from("mood_entries").select("id, body, emoji, created_at").eq("space_id", spaceId),
    client.from("calendar_events").select("id, name, icon, event_date").eq("space_id", spaceId),
  ]);
  if (journals.error || moods.error || events.error) throw new Error("Unable to load memories");
  return buildMemoryFeed({ journals: (journals.data ?? []) as JournalRow[], moods: (moods.data ?? []) as MoodRow[], events: (events.data ?? []) as EventRow[] });
}
