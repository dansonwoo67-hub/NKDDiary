import { describe, expect, it } from "vitest";
import type { NotificationItem } from "./actions";
import { selectRecentNotifications } from "./selection";

function item(id: string, createdAt: string, isRead: boolean): NotificationItem {
  return {
    id,
    createdAt,
    isRead,
    title: "",
    body: "",
    href: "/",
    type: "journal_created",
    sourceId: id,
    actorName: "Niki",
  };
}

describe("selectRecentNotifications", () => {
  it("returns the latest five messages without producing mutation metadata", () => {
    const items = [
      item("1", "2026-07-01T00:00:00Z", false),
      item("2", "2026-07-02T00:00:00Z", true),
      item("3", "2026-07-03T00:00:00Z", false),
      item("4", "2026-07-04T00:00:00Z", true),
      item("5", "2026-07-05T00:00:00Z", true),
      item("6", "2026-07-06T00:00:00Z", true),
    ];

    expect(selectRecentNotifications(items).map((x) => x.id)).toEqual([
      "6",
      "5",
      "4",
      "3",
      "2",
    ]);
  });

  it("does not mutate caller order while selecting recent messages", () => {
    const items = [
      item("1", "2026-07-01T00:00:00Z", false),
      item("2", "2026-07-02T00:00:00Z", false),
      item("3", "2026-07-03T00:00:00Z", true),
      item("4", "2026-07-04T00:00:00Z", true),
      item("5", "2026-07-05T00:00:00Z", true),
      item("6", "2026-07-06T00:00:00Z", true),
    ];

    selectRecentNotifications(items);

    expect(items.map((entry) => entry.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });
});
