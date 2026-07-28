import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationItem } from "@/features/notifications/actions";
import { NotificationCenterClient } from "./NotificationCenterClient";

const { markNotificationReadAction, validateJournalEntryForUser, push, refresh } = vi.hoisted(() => ({
  markNotificationReadAction: vi.fn(),
  validateJournalEntryForUser: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

vi.mock("@/features/notifications/actions", () => ({
  markNotificationReadAction,
  validateJournalEntryForUser,
}));

function notification(type: string): NotificationItem {
  return {
    id: `${type}-1`,
    title: "新消息",
    body: "消息内容",
    href: "/",
    createdAt: "2026-07-28T02:00:00Z",
    type,
    isRead: false,
    sourceId: "source-1",
    actorName: "Niki",
  };
}

describe("NotificationCenterClient unread totals", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    markNotificationReadAction.mockResolvedValue({ ok: true, message: "已读。" });
    validateJournalEntryForUser.mockResolvedValue({ ok: true, message: "" });
  });

  it("renders server totals instead of counting the five visible rows", () => {
    render(
      <NotificationCenterClient
        accountId="user-1"
        inbox={[notification("journal_created")]}
        activity={[notification("memory_created")]}
        inboxUnreadCount={8}
        activityUnreadCount={12}
      />,
    );

    expect(screen.getByRole("button", { name: /收信箱/ })).toHaveTextContent("8");
    expect(screen.getByRole("button", { name: /新动态/ })).toHaveTextContent("12");
  });
});
