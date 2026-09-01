import { describe, expect, it, vi } from "vitest";
import { buildNotificationHref, isNotificationNavigable, resolveLetterNotificationTarget, type NotificationDomain } from "./target";

const notification = (overrides: Partial<NotificationDomain> = {}): NotificationDomain => ({
  id: "notification-1",
  recipientId: "user-b",
  type: "memory_created",
  sourceId: "memory-1",
  target: { type: "memory", memoryId: "memory-1" },
  isRead: false,
  isActive: true,
  createdAt: "2026-08-29T01:00:00Z",
  ...overrides,
});

describe("notification target contract", () => {
  it("keeps unread active notifications navigable", () => {
    expect(isNotificationNavigable(notification())).toBe(true);
  });

  it("keeps read active notifications navigable", () => {
    expect(isNotificationNavigable(notification({ isRead: true }))).toBe(true);
  });

  it("does not navigate inactive notifications", () => {
    expect(isNotificationNavigable(notification({ isActive: false }))).toBe(false);
  });

  it("builds a memory comment anchor without conflating it with the notification source", () => {
    expect(buildNotificationHref({
      type: "memory_comment",
      memoryId: "memory-1",
      commentId: "comment-7",
    })).toBe("/memories?focus=memory-1#comment-comment-7");
  });

  it.each([
    [{ type: "letter_thread", threadId: "thread-1", letterId: "letter-2" } as const, "/journal/thread/thread-1?letter=letter-2"],
    [{ type: "calendar_event", eventId: "event-1", date: "2026-08-29" } as const, "/calendar?event=event-1&date=2026-08-29"],
    [{ type: "calendar_date", date: "2026-08-29" } as const, "/calendar?date=2026-08-29"],
    [{ type: "relationship_setting", setting: "relationship_started_on" } as const, "/settings?setting=relationship_started_on"],
  ])("maps %o to %s", (target, expected) => {
    expect(buildNotificationHref(target)).toBe(expected);
  });

  it("maps the narrow resolver result without consulting notification read state", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ thread_id: "thread-1", letter_id: "letter-2" }],
      error: null,
    });
    await expect(resolveLetterNotificationTarget({ rpc } as never, "notice-1")).resolves.toEqual({
      type: "letter_thread",
      threadId: "thread-1",
      letterId: "letter-2",
    });
    expect(rpc).toHaveBeenCalledWith("resolve_letter_notification_target", { p_notification_id: "notice-1" });
  });
});
