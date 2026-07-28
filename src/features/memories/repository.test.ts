import { describe, expect, it } from "vitest";
import { buildMemoryFeed } from "./repository";

describe("memory projection", () => {
  it("combines only moods, independent memories, and eligible calendar events", () => {
    const feed = buildMemoryFeed({
      memories: [
        { id: "memory", title: "海边", body: "一起看海", occurred_on: "2026-07-23", image_path: null, author_id: "u1", created_at: "2026-07-23T03:00:00Z" },
      ],
      moods: [{ id: "mood", body: "开心", emoji: "", author_id: "u2", created_at: "2026-07-23T04:00:00Z" }],
      events: [
        { id: "date", name: "约会", icon: "💕", event_date: "2026-07-23", recurrence: "none", event_type: "date", is_important: false },
        { id: "todo", name: "买牛奶", icon: "✓", event_date: "2026-07-23", recurrence: "none", event_type: "todo", is_important: false },
      ],
      today: "2026-07-23",
    });
    expect(feed.map((item) => item.kind).sort()).toEqual(["calendar", "memory", "mood"]);
    expect(feed.map((item) => item.id)).not.toContain("todo");
  });

  it("uses the most recent occurred recurrence and excludes future calendar events", () => {
    const feed = buildMemoryFeed({ memories: [], moods: [], today: "2026-04-29", events: [
      { id: "monthly", name: "月末", icon: "🌙", event_date: "2026-01-31", recurrence: "monthly", event_type: "date", is_important: false },
      { id: "yearly", name: "闰日", icon: "💫", event_date: "2024-02-29", recurrence: "yearly", event_type: "anniversary", is_important: false },
      { id: "future", name: "未来", icon: "🌹", event_date: "2026-05-01", recurrence: "none", event_type: "date", is_important: false },
    ] });
    expect(feed.map((item) => item.id)).toEqual(["monthly", "yearly"]);
    expect(feed[0].occurredAt).toContain("2026-03-31");
    expect(feed[1].occurredAt).toContain("2026-02-28");
  });
});
