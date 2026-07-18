import { resolveRecurringEventDateOnly } from "@/features/calendar/recurrence";
import { buildHeartDays, getCalendarRange, type CalendarView, type HeartState } from "@/features/calendar/heart-range";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type HomeProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  last_login_latitude: number | null;
  last_login_longitude: number | null;
  relationship_started_on: string;
  created_at: string;
};

export type HomeLocationRow = {
  author_id: string;
  latitude: number | null;
  longitude: number | null;
  location_recorded_at: string | null;
};

export type HomeLetterRow = {
  author_id: string;
  letter_date: string;
  status: "draft" | "scheduled" | "published" | "withdrawn";
  kind: "daily" | "time_capsule";
};

export type HomeEventRow = {
  id: string;
  name: string;
  event_date: string;
  recurrence: "none" | "monthly" | "yearly";
  icon: string;
  color: "rose" | "gold" | "blue" | "green" | "purple";
};

export type HomeDay = {
  date: string;
  dayOfMonth: number;
  monthLabel: string | null;
  heartState: HeartState;
  publicState: "none" | "a" | "b" | "both";
  privateState: boolean;
  recordCount: number;
  envelopeCount: number;
  events: Array<Pick<HomeEventRow, "id" | "name" | "icon" | "color">>;
};

export type HomeSnapshotRows = {
  profiles: HomeProfileRow[];
  latestLocations: HomeLocationRow[];
  letters: HomeLetterRow[];
  events: HomeEventRow[];
  unreadCount: number;
};

export type HomeQueryRange = { start: string; end: string; viewerId: string };

export type HomeQueryClient = {
  getProfiles(): Promise<HomeProfileRow[]>;
  getLatestLocations(viewerId: string): Promise<HomeLocationRow[]>;
  getLetters(range: HomeQueryRange): Promise<HomeLetterRow[]>;
  getEvents(range: HomeQueryRange): Promise<HomeEventRow[]>;
  getUnreadCount(viewerId: string): Promise<number>;
};

export type HomeSnapshot = HomeSnapshotRows & {
  range: Pick<HomeQueryRange, "start" | "end">;
  days: HomeDay[];
};

function dateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInRange(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const last = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const result: string[] = [];

  while (cursor <= last) {
    result.push(dateString(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function occurrenceDate(event: HomeEventRow, year: number, month: number) {
  const [, originalMonth] = event.event_date.split("-").map(Number);
  if (event.recurrence === "none") {
    return event.event_date.startsWith(`${year}-${String(month).padStart(2, "0")}-`) ? event.event_date : null;
  }
  if (event.recurrence === "monthly") {
    const date = resolveRecurringEventDateOnly(event.event_date, year, month);
    return date >= event.event_date ? date : null;
  }
  if (originalMonth !== month) return null;
  const date = resolveRecurringEventDateOnly(event.event_date, year, month);
  return date >= event.event_date ? date : null;
}

export function buildHomeSnapshot(rows: HomeSnapshotRows, range: HomeQueryRange): HomeSnapshot {
  const profileIds = rows.profiles.map((profile) => profile.id);
  const [year, month] = range.start.split("-").map(Number);
  const lettersByDate = new Map<string, HomeLetterRow[]>();
  const eventsByDate = new Map<string, HomeDay["events"]>();

  for (const letter of rows.letters) {
    if (letter.letter_date < range.start || letter.letter_date > range.end) continue;
    lettersByDate.set(letter.letter_date, [...(lettersByDate.get(letter.letter_date) ?? []), letter]);
  }

  for (const event of rows.events) {
    const date = occurrenceDate(event, year, month);
    if (!date || date < range.start || date > range.end) continue;
    const summary = { id: event.id, name: event.name, icon: event.icon, color: event.color };
    eventsByDate.set(date, [...(eventsByDate.get(date) ?? []), summary]);
  }

  const heartDays = buildHeartDays(
    rows.letters.map((letter) => ({
      authorId: letter.author_id,
      date: letter.letter_date,
      status: letter.status,
      kind: letter.kind,
    })),
    range.viewerId,
    { start: range.start, end: range.end },
    profileIds,
  );

  const days = daysInRange(range.start, range.end).map<HomeDay>((date, index) => {
    const letters = lettersByDate.get(date) ?? [];
    const publishedAuthors = new Set(
      letters
        .filter((letter) => letter.kind === "daily" && letter.status === "published")
        .map((letter) => letter.author_id),
    );
    const heart = heartDays[index];
    const heartState = heart?.state ?? "empty";
    const publicState = heartState === "private" || heartState === "empty" ? "none" : heartState;

    return {
      date,
      dayOfMonth: Number(date.slice(-2)),
      monthLabel: heart?.monthLabel ?? null,
      heartState,
      publicState,
      privateState: heartState === "private",
      recordCount: publishedAuthors.size,
      envelopeCount: heart?.envelopeCount ?? 0,
      events: eventsByDate.get(date) ?? [],
    };
  });

  return { ...rows, range: { start: range.start, end: range.end }, days };
}

function monthRange(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid month");
  }
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: dateString(year, month, 1), end: dateString(year, month, endDay) };
}

async function rowsOrThrow<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const result = await promise;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function createSupabaseHomeQueryClient(): Promise<HomeQueryClient> {
  const supabase = await createServerSupabaseClient();
  return {
    async getProfiles() {
      const data = await rowsOrThrow(
        supabase
          .from("profiles")
          .select(
            "id, display_name, avatar_url, last_login_latitude, last_login_longitude, relationship_started_on, created_at",
          )
          .order("created_at", { ascending: true }),
      );
      return (data ?? []) as HomeProfileRow[];
    },
    async getLatestLocations(viewerId) {
      const data = await rowsOrThrow(
        supabase
          .from("letters")
          .select("author_id, latitude, longitude, location_recorded_at")
          .eq("author_id", viewerId)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("location_recorded_at", { ascending: false })
          .limit(1),
      );
      return (data ?? []) as HomeLocationRow[];
    },
    async getLetters({ start, end }) {
      const data = await rowsOrThrow(
        supabase
          .from("letters")
          .select("author_id, letter_date, status, kind")
          .gte("letter_date", start)
          .lte("letter_date", end)
          .in("status", ["draft", "scheduled", "published"]),
      );
      return (data ?? []) as HomeLetterRow[];
    },
    async getEvents({ start, end }) {
      const data = await rowsOrThrow(
        supabase
          .from("calendar_events")
          .select("id, name, event_date, recurrence, icon, color")
          .lte("event_date", end)
          .or(`recurrence.neq.none,event_date.gte.${start}`)
          .order("event_date", { ascending: true }),
      );
      return (data ?? []) as HomeEventRow[];
    },
    async getUnreadCount(viewerId) {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", viewerId)
        .eq("is_read", false);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  };
}

export async function getHomeSnapshot({
  userId,
  year,
  month,
  view = "month",
  client,
}: {
  userId: string;
  year: number;
  month: number;
  view?: CalendarView;
  client?: HomeQueryClient;
}) {
  const { start, end } = view === "month"
    ? monthRange(year, month)
    : getCalendarRange(view, new Date(`${year}-${String(month).padStart(2, "0")}-15T00:00:00+08:00`));
  const queryClient = client ?? (await createSupabaseHomeQueryClient());
  const range = { start, end, viewerId: userId };
  const [profiles, latestLocations, letters, events, unreadCount] = await Promise.all([
    queryClient.getProfiles(),
    queryClient.getLatestLocations(userId),
    queryClient.getLetters(range),
    queryClient.getEvents(range),
    queryClient.getUnreadCount(userId),
  ]);

  return buildHomeSnapshot({ profiles, latestLocations, letters, events, unreadCount }, range);
}
