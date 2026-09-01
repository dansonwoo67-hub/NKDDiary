import { describe, expect, it, vi } from "vitest";
import { buildMemoryFeed, listMemories } from "./repository";

describe("memory projection", () => {
  it("combines only moods, independent memories, and eligible calendar events", () => {
    const feed = buildMemoryFeed({
      memories: [
        { id: "memory", title: "海边", body: "一起看海", occurred_on: "2026-07-23", image_path: null, author_id: "u1", created_at: "2026-07-23T03:00:00Z", author_name_snapshot: null, author_avatar_snapshot: null },
      ],
      moods: [{ id: "mood", body: "开心", emoji: "", author_id: "u2", created_at: "2026-07-23T04:00:00Z", author_name_snapshot: null, author_avatar_snapshot: null }],
      events: [
        { id: "date", name: "约会", icon: "💕", event_date: "2026-07-23", recurrence: "none", event_type: "date", is_important: false, creator_id: "u1", creator_name_snapshot: null, creator_avatar_snapshot: null },
        { id: "todo", name: "买牛奶", icon: "✓", event_date: "2026-07-23", recurrence: "none", event_type: "todo", is_important: false, creator_id: "u1", creator_name_snapshot: null, creator_avatar_snapshot: null },
      ],
      today: "2026-07-23",
    });
    expect(feed.map((item) => item.kind).sort()).toEqual(["calendar", "memory", "mood"]);
    expect(feed.map((item) => item.id)).not.toContain("todo");
  });

  it("uses the most recent occurred recurrence and excludes future calendar events", () => {
    const feed = buildMemoryFeed({ memories: [], moods: [], today: "2026-04-29", events: [
      { id: "monthly", name: "月末", icon: "🌙", event_date: "2026-01-31", recurrence: "monthly", event_type: "date", is_important: false, creator_id: "u1", creator_name_snapshot: null, creator_avatar_snapshot: null },
      { id: "yearly", name: "闰日", icon: "💫", event_date: "2024-02-29", recurrence: "yearly", event_type: "anniversary", is_important: false, creator_id: "u1", creator_name_snapshot: null, creator_avatar_snapshot: null },
      { id: "future", name: "未来", icon: "🌹", event_date: "2026-05-01", recurrence: "none", event_type: "date", is_important: false, creator_id: "u1", creator_name_snapshot: null, creator_avatar_snapshot: null },
    ] });
    expect(feed.map((item) => item.id)).toEqual(["monthly", "yearly"]);
    expect(feed[0].occurredAt).toContain("2026-03-31");
    expect(feed[1].occurredAt).toContain("2026-02-28");
  });

  it("uses shared chronology for mixed feed items", () => {
    const feed = buildMemoryFeed({
      memories: [
        { id: "memory", title: "较早发生", body: "", occurred_on: "2026-07-25", image_path: null, author_id: "u1", created_at: "2026-07-27T01:00:00Z", author_name_snapshot: null, author_avatar_snapshot: null },
      ],
      moods: [
        { id: "mood", body: "较晚发生", emoji: "", author_id: "u2", created_at: "2026-07-26T01:00:00Z", author_name_snapshot: null, author_avatar_snapshot: null },
      ],
      events: [],
    });

    expect(feed.map((item) => item.id)).toEqual(["mood", "memory"]);
  });

  it("resolves all memory image URLs in one storage operation", async () => {
    const rows = {
      memory_entries: [
        { id: "m1", title: "一", body: "", occurred_on: "2026-07-25", image_path: "space/m1.jpg", author_id: "u1", created_at: "2026-07-25T01:00:00Z", author_name_snapshot: "Susan", author_avatar_snapshot: null },
        { id: "m2", title: "二", body: "", occurred_on: "2026-07-24", image_path: "space/m2.jpg", author_id: "u2", created_at: "2026-07-24T01:00:00Z", author_name_snapshot: "Niki", author_avatar_snapshot: null },
      ],
      mood_entries: [],
      calendar_events: [],
      profiles: [],
    };
    const from = vi.fn((table: keyof typeof rows) => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: rows[table], error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: rows[table], error: null }),
      })),
    }));
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: "space/m1.jpg", signedUrl: "https://signed/m1" },
        { path: "space/m2.jpg", signedUrl: "https://signed/m2" },
      ],
      error: null,
    });
    const createSignedUrl = vi.fn();
    const client = {
      from,
      storage: { from: vi.fn(() => ({ createSignedUrl, createSignedUrls })) },
    };

    const result = await listMemories(client as never, "space-1");

    expect(createSignedUrls).toHaveBeenCalledWith(["space/m1.jpg", "space/m2.jpg"], 300);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(result.filter((item) => item.kind === "memory").map((item) => item.imageUrl)).toEqual([
      "https://signed/m1",
      "https://signed/m2",
    ]);
  });
});
