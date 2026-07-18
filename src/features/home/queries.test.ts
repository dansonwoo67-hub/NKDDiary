import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildHomeSnapshot, getHomeSnapshot, type HomeQueryClient } from "./queries";

const profiles = [
  {
    id: "a",
    display_name: "A",
    avatar_url: null,
    last_login_latitude: 31,
    last_login_longitude: 121,
    relationship_started_on: "2025-10-02",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "b",
    display_name: "B",
    avatar_url: null,
    last_login_latitude: 23,
    last_login_longitude: 113,
    relationship_started_on: "2025-10-02",
    created_at: "2025-01-02T00:00:00Z",
  },
];

describe("home snapshot", () => {
  it("builds a bounded month and separates public from viewer-private state", () => {
    const result = buildHomeSnapshot(
      {
        profiles,
        latestLocations: [],
        letters: [
          { author_id: "a", letter_date: "2026-07-01", status: "published", kind: "daily" },
          { author_id: "b", letter_date: "2026-07-01", status: "draft", kind: "daily" },
          { author_id: "a", letter_date: "2026-08-01", status: "published", kind: "daily" },
        ],
        events: [],
        unreadCount: 2,
      },
      { start: "2026-07-01", end: "2026-07-31", viewerId: "a" },
    );

    expect(result.days).toHaveLength(31);
    expect(result.days[0]).toMatchObject({ date: "2026-07-01", publicState: "a", privateState: false });
    expect(result.unreadCount).toBe(2);
    expect(result.days.some((day) => day.date === "2026-08-01")).toBe(false);
  });

  it("marks both published authors, only the viewer's private work, and recurring events", () => {
    const result = buildHomeSnapshot(
      {
        profiles,
        latestLocations: [],
        letters: [
          { author_id: "a", letter_date: "2026-07-10", status: "published", kind: "daily" },
          { author_id: "b", letter_date: "2026-07-10", status: "published", kind: "daily" },
          { author_id: "a", letter_date: "2026-07-11", status: "scheduled", kind: "time_capsule" },
          { author_id: "b", letter_date: "2026-07-12", status: "draft", kind: "daily" },
        ],
        events: [
          { id: "event", name: "提醒", event_date: "2026-06-15", recurrence: "monthly", icon: "🌹", color: "rose" },
          { id: "future", name: "尚未开始", event_date: "2026-08-16", recurrence: "monthly", icon: "✈️", color: "blue" },
        ],
        unreadCount: 0,
      },
      { start: "2026-07-01", end: "2026-07-31", viewerId: "a" },
    );

    expect(result.days[9].publicState).toBe("both");
    expect(result.days[10].privateState).toBe(true);
    expect(result.days[11].privateState).toBe(false);
    expect(result.days[14].events).toHaveLength(1);
    expect(result.days[15].events).toHaveLength(0);
  });

  it("starts all independent reads before waiting and uses bounded projections", async () => {
    const starts: string[] = [];
    const resolvers: Array<() => void> = [];
    const pending = <T>(name: string, value: T) => {
      starts.push(name);
      return new Promise<T>((resolve) => resolvers.push(() => resolve(value)));
    };
    const client: HomeQueryClient = {
      getProfiles: vi.fn(() => pending("profiles", profiles)),
      getLatestLocations: vi.fn(() => pending("locations", [])),
      getLetters: vi.fn(() => pending("letters", [])),
      getEvents: vi.fn(() => pending("events", [])),
      getUnreadCount: vi.fn(() => pending("unread", 0)),
    };

    const snapshotPromise = getHomeSnapshot({ userId: "a", year: 2026, month: 7, client });
    expect(starts).toEqual(["profiles", "locations", "letters", "events", "unread"]);
    resolvers.forEach((resolve) => resolve());
    const result = await snapshotPromise;

    expect(result.range).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(client.getLetters).toHaveBeenCalledWith({ start: "2026-07-01", end: "2026-07-31", viewerId: "a" });
  });

  it("rejects invalid month requests instead of issuing unbounded reads", async () => {
    const client: HomeQueryClient = {
      getProfiles: vi.fn(),
      getLatestLocations: vi.fn(),
      getLetters: vi.fn(),
      getEvents: vi.fn(),
      getUnreadCount: vi.fn(),
    };

    await expect(getHomeSnapshot({ userId: "a", year: 2026, month: 13, client })).rejects.toThrow("Invalid month");
    expect(client.getLetters).not.toHaveBeenCalled();
  });

  it("passes an upper event-date bound to Supabase", () => {
    const source = readFileSync(resolve(process.cwd(), "src/features/home/queries.ts"), "utf8");

    expect(source).toMatch(/from\("calendar_events"\)[\s\S]*?\.lte\("event_date", end\)/);
  });
});
