import { describe, expect, it } from "vitest";
import { compareMemoryChronology, mapLegacyMemoryToMemory, mapLegacyMoodToMemory } from "./domain";

describe("unified memory adapters", () => {
  it("maps a legacy mood without inventing a title or image", () => {
    expect(mapLegacyMoodToMemory({
      id: "mood-1",
      author_id: "user-a",
      body: "今天很开心",
      emoji: "🌷",
      created_at: "2026-08-29T01:02:03Z",
    })).toEqual({
      id: "mood-1",
      sourceType: "legacy_mood",
      authorId: "user-a",
      content: "今天很开心",
      legacyTitle: null,
      image: null,
      createdAt: "2026-08-29T01:02:03Z",
      updatedAt: "2026-08-29T01:02:03Z",
      reactionSummary: { total: 0, byReaction: {} },
      commentCount: 0,
    });
  });

  it("preserves a legacy memory title and image", () => {
    const memory = mapLegacyMemoryToMemory({
      id: "memory-1",
      author_id: "user-b",
      title: "第一次看海",
      body: "风很大。",
      image_path: "space/user/photo.webp",
      occurred_on: "2025-04-03",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });

    expect(memory).toMatchObject({
      sourceType: "legacy_memory",
      legacyTitle: "第一次看海",
      content: "风很大。",
      image: { path: "space/user/photo.webp", url: null },
      occurredOn: "2025-04-03",
      updatedAt: "2026-01-02T00:00:00Z",
    });
  });

  it("maps a memory without an image to null", () => {
    expect(mapLegacyMemoryToMemory({
      id: "memory-2",
      author_id: "user-a",
      title: "旧标题",
      body: "只有文字",
      image_path: null,
      occurred_on: "2025-05-01",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
      comment_count: 3,
    })).toMatchObject({
      image: null,
      commentCount: 3,
      updatedAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("memory chronology", () => {
  it("orders occurred time before creation time", () => {
    const items = [
      { id: "older-occurrence", kind: "memory", occurredAt: "2026-07-25T12:00:00+08:00", createdAt: "2026-07-26T12:00:00+08:00" },
      { id: "newer-occurrence", kind: "mood", occurredAt: "2026-07-26T01:00:00+08:00", createdAt: "2026-07-26T01:00:00+08:00" },
    ];

    expect(items.sort(compareMemoryChronology).map((item) => item.id)).toEqual([
      "newer-occurrence",
      "older-occurrence",
    ]);
  });

  it("uses creation time when occurred times match", () => {
    const items = [
      { id: "created-earlier", kind: "memory", occurredAt: "2026-07-26T12:00:00+08:00", createdAt: "2026-07-26T01:00:00+08:00" },
      { id: "created-later", kind: "mood", occurredAt: "2026-07-26T12:00:00+08:00", createdAt: "2026-07-26T02:00:00+08:00" },
    ];

    expect(items.sort(compareMemoryChronology).map((item) => item.id)).toEqual([
      "created-later",
      "created-earlier",
    ]);
  });

  it("uses kind and id as stable final tie breakers", () => {
    const items = [
      { id: "b", kind: "mood", occurredAt: "2026-07-26T12:00:00+08:00", createdAt: "2026-07-26T12:00:00+08:00" },
      { id: "a", kind: "mood", occurredAt: "2026-07-26T12:00:00+08:00", createdAt: "2026-07-26T12:00:00+08:00" },
      { id: "z", kind: "memory", occurredAt: "2026-07-26T12:00:00+08:00", createdAt: "2026-07-26T12:00:00+08:00" },
    ];

    expect(items.sort(compareMemoryChronology).map((item) => item.id)).toEqual(["z", "a", "b"]);
  });
});
