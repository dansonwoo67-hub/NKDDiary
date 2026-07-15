import { describe, expect, it } from "vitest";
import { buildNotificationHref } from "./hrefs";

describe("notification hrefs", () => {
  it("links letter notifications to the date and letter query", () => {
    expect(buildNotificationHref({
      type: "letter_opened",
      letterDate: "2026-07-13",
      letterId: "letter-1",
    })).toBe("/letters/2026-07-13?letter=letter-1");
  });

  it("links annotation notifications to the original highlighted text", () => {
    expect(buildNotificationHref({
      type: "annotation",
      letterDate: "2026-07-13",
      letterId: "letter-1",
      annotationId: "annotation-1",
    })).toBe("/letters/2026-07-13?letter=letter-1#annotation-annotation-1");
  });

  it("falls back to home when the source cannot be resolved", () => {
    expect(buildNotificationHref({ type: "calendar_event" })).toBe("/");
  });
});
