import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/features/notifications/actions", () => ({
  markNotificationReadAction,
  validateJournalEntryForUser,
}));

const unreadLetter: NotificationItem = {
  id: "notification-1",
  title: "新来信",
  body: "信件提醒",
  href: "/journal/letter-1",
  createdAt: "2026-07-28T02:00:00Z",
  type: "journal_created",
  isRead: false,
  sourceId: "letter-1",
  actorName: "Susan",
};

function renderCenter() {
  render(
    <NotificationCenterClient
      accountId="user-1"
      inbox={[unreadLetter]}
      activity={[]}
      inboxUnreadCount={1}
      activityUnreadCount={0}
    />,
  );
  const inboxButton = screen.getAllByRole("button")[0];
  fireEvent.click(inboxButton);
  fireEvent.click(screen.getByRole("button", { name: /Susan/ }));
  return inboxButton;
}

describe("NotificationCenterClient click consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateJournalEntryForUser.mockResolvedValue({ ok: true, message: "" });
  });
  afterEach(cleanup);

  it("restores unread UI and stays on the page when mark-read fails", async () => {
    markNotificationReadAction.mockResolvedValue({
      ok: false,
      message: "网络繁忙，请稍后重试。",
    });

    const inboxButton = renderCenter();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("标记已读失败，请检查网络后重试。");
    });
    expect(inboxButton).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Susan/ })).toHaveClass("is-unread");
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("waits for mark-read success before navigating and refreshing", async () => {
    let resolveMark: (value: { ok: boolean; message: string }) => void = () => {};
    markNotificationReadAction.mockImplementation(() => new Promise((resolve) => {
      resolveMark = resolve;
    }));

    renderCenter();
    expect(push).not.toHaveBeenCalled();

    await waitFor(() => expect(markNotificationReadAction).toHaveBeenCalledOnce());
    resolveMark({ ok: true, message: "已读。" });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/journal/letter-1");
    });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
