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

function item(id: string, actorName: string): NotificationItem {
  return {
    id,
    title: "新来信",
    body: "信件提醒",
    href: `/journal/${id}`,
    createdAt: "2026-07-28T02:00:00Z",
    type: "journal_created",
    isRead: false,
    sourceId: id,
    actorName,
  };
}

function props(accountId: string, actorName: string, count: number) {
  return {
    accountId,
    inbox: [item(`${accountId}-letter`, actorName)],
    activity: [],
    inboxUnreadCount: count,
    activityUnreadCount: 0,
  };
}

describe("NotificationCenterClient account isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateJournalEntryForUser.mockResolvedValue({ ok: true, message: "" });
    markNotificationReadAction.mockResolvedValue({ ok: true, message: "已读。" });
  });
  afterEach(cleanup);

  it("synchronizes list and unread total for Susan → Niki → Susan", async () => {
    const view = render(<NotificationCenterClient {...props("susan", "Niki", 3)} />);
    expect(screen.getByRole("button", { name: /收信箱/ })).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("button", { name: /收信箱/ }));
    expect(screen.getByRole("button", { name: /Niki/ })).toBeInTheDocument();

    view.rerender(<NotificationCenterClient {...props("niki", "Susan", 7)} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /收信箱/ })).toHaveTextContent("7");
    });
    fireEvent.click(screen.getByRole("button", { name: /收信箱/ }));
    expect(screen.queryByRole("button", { name: /Niki/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Susan/ })).toBeInTheDocument();

    view.rerender(<NotificationCenterClient {...props("susan", "Niki", 2)} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /收信箱/ })).toHaveTextContent("2");
    });
    fireEvent.click(screen.getByRole("button", { name: /收信箱/ }));
    expect(screen.queryByRole("button", { name: /Susan/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Niki/ })).toBeInTheDocument();
  });

  it("ignores completion from a notification click started by the previous account", async () => {
    let resolveValidation: (value: { ok: boolean; message: string }) => void = () => {};
    validateJournalEntryForUser.mockImplementation(() => new Promise((resolve) => {
      resolveValidation = resolve;
    }));
    const view = render(<NotificationCenterClient {...props("susan", "Niki", 1)} />);
    fireEvent.click(screen.getByRole("button", { name: /收信箱/ }));
    fireEvent.click(screen.getByRole("button", { name: /Niki/ }));
    await waitFor(() => expect(validateJournalEntryForUser).toHaveBeenCalledOnce());

    view.rerender(<NotificationCenterClient {...props("niki", "Susan", 4)} />);
    resolveValidation({ ok: true, message: "" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /收信箱/ })).toHaveTextContent("4");
    });
    expect(markNotificationReadAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("replaces local notification state with a refreshed server snapshot", async () => {
    const view = render(<NotificationCenterClient {...props("susan", "Niki-old", 5)} />);
    fireEvent.click(screen.getByRole("button", { name: /收信箱/ }));
    expect(screen.getByRole("button", { name: /Niki-old/ })).toBeInTheDocument();

    view.rerender(<NotificationCenterClient {...props("susan", "Niki-new", 2)} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /收信箱/ })).toHaveTextContent("2");
    });
    fireEvent.click(screen.getByRole("button", { name: /收信箱/ }));
    expect(screen.queryByRole("button", { name: /Niki-old/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Niki-new/ })).toBeInTheDocument();
  });
});
