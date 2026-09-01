import { describe, expect, it } from "vitest";
import { buildHomeOverview } from "./repository";

describe("home overview", () => {
  it("keeps empty states valid", () => {
    expect(buildHomeOverview({ memories: [], calendarDays: [], today: "2026-07-25" })).toEqual({
      recentMemories: [],
      upcomingEvents: [],
    });
  });

  it("keeps only memories and homepage text moods in the recent story line", () => {
    const overview = buildHomeOverview({
      memories: [
        { id: "event", kind: "calendar", title: "纪念日", occurredAt: "2026-07-26T00:00:00Z" },
        { id: "memory", kind: "memory", title: "海边", occurredAt: "2026-07-25T00:00:00Z" },
        { id: "mood", kind: "mood", title: "今天很想你", occurredAt: "2026-07-24T00:00:00Z" },
      ],
      calendarDays: [],
      today: "2026-07-25",
    });

    expect(overview.recentMemories.map((item) => item.id)).toEqual(["memory", "mood"]);
  });

  it("uses the same occurred-time-first chronology as the memory feed", () => {
    const overview = buildHomeOverview({
      memories: [
        {
          id: "older-memory",
          kind: "memory",
          title: "今天的回忆",
          occurredAt: "2026-07-26T12:00:00+08:00",
          createdAt: "2026-07-26T00:30:00+08:00",
        },
        {
          id: "newer-mood",
          kind: "mood",
          title: "刚刚写下的心情",
          occurredAt: "2026-07-26T01:00:00+08:00",
          createdAt: "2026-07-26T01:00:00+08:00",
        },
      ],
      calendarDays: [],
      today: "2026-07-26",
    });

    expect(overview.recentMemories.map((item) => item.id)).toEqual(["older-memory", "newer-mood"]);
  });

  it("breaks identical timestamps deterministically by kind then id", () => {
    const overview = buildHomeOverview({
      memories: [
        { id: "b", kind: "mood", title: "B", occurredAt: "2026-07-26T12:00:00+08:00", createdAt: "2026-07-26T12:00:00+08:00" },
        { id: "a", kind: "mood", title: "A", occurredAt: "2026-07-26T12:00:00+08:00", createdAt: "2026-07-26T12:00:00+08:00" },
        { id: "z", kind: "memory", title: "Z", occurredAt: "2026-07-26T12:00:00+08:00", createdAt: "2026-07-26T12:00:00+08:00" },
      ],
      calendarDays: [],
      today: "2026-07-26",
    });

    expect(overview.recentMemories.map((item) => item.id)).toEqual(["z", "a", "b"]);
  });

  it("does not impose a fixed item count on the recent story line", () => {
    const memories = Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      kind: index % 2 ? "mood" as const : "memory" as const,
      title: `记录 ${index}`,
      occurredAt: `2026-07-${String(20 + index).padStart(2, "0")}T00:00:00Z`,
    }));

    const overview = buildHomeOverview({ memories, calendarDays: [], today: "2026-07-25" });
    expect(overview.recentMemories).toHaveLength(8);
  });
});
