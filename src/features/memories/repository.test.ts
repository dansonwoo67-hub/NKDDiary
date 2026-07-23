import { describe, expect, it } from "vitest";
import { buildMemoryFeed, JOURNAL_MEMORY_FIELDS } from "./repository";

describe("memory projection", () => {
  it("contains today and explicitly opened future diaries but excludes unopened future content", () => {
    const feed = buildMemoryFeed({
      journals: [
        { id: "today", entry_type: "today", title: "今天", published_at: "2026-07-23T01:00:00Z", opened_at: null },
        { id: "opened", entry_type: "future", title: "已开启", published_at: "2026-07-22T01:00:00Z", opened_at: "2026-07-23T02:00:00Z" },
        { id: "sealed", entry_type: "future", title: "绝密标题", published_at: "2026-07-21T01:00:00Z", opened_at: null },
      ],
      moods: [],
      events: [],
    });
    expect(feed.map((item) => item.id)).toEqual(["opened", "today"]);
    expect(JSON.stringify(feed)).not.toContain("绝密标题");
  });

  it("does not select journal body or image fields", () => {
    expect(JOURNAL_MEMORY_FIELDS).toBe("id, entry_type, title, published_at, opened_at");
    expect(JOURNAL_MEMORY_FIELDS).not.toMatch(/content|image_path|open_at/);
  });
});
