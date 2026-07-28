import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/features/profile/repository", () => ({
  listActiveSpaceProfiles: vi.fn(),
}));

import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listActiveSpaceProfiles } from "@/features/profile/repository";
import {
  getNotificationCenterData,
  getUnreadNotificationState,
  getUnreadNotifications,
  markNotificationReadAction,
  validateJournalEntryForUser,
} from "./actions";

const mockRequireUser = vi.mocked(requireUser);
const mockCreateClient = vi.mocked(createServerSupabaseClient);
const mockListProfiles = vi.mocked(listActiveSpaceProfiles);

describe("notification routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      userId: "user-1",
      spaceId: "space-1",
    } as never);
    mockListProfiles.mockResolvedValue([
      { id: "user-1", display_name: "Susan" },
      { id: "user-2", display_name: "Niki" },
    ] as never);
  });

  it("links a future diary opened notification to the existing future diary inbox", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{
        id: "notice-1",
        type: "future_diary_opened",
        source_id: "33333333-3333-4333-8333-333333333333",
        title: "未来日记已被开启",
        body: "对方打开了你封存的未来日记。",
        created_at: "2026-08-01T12:00:00Z",
      }],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mockCreateClient.mockResolvedValue({ from } as never);

    await expect(getUnreadNotifications()).resolves.toEqual([expect.objectContaining({
      href: "/journal/future",
    })]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("loads the notification center without implicitly marking anything read", async () => {
    const data = [{
      id: "notice-1",
      type: "memory_created",
      source_id: "44444444-4444-4444-8444-444444444444",
      title: "新增了一段回忆",
      body: "一起散步",
      is_read: false,
      is_active: true,
      created_at: "2026-07-28T02:00:00Z",
      actor_id: "",
      related_entry_id: null,
      metadata: {},
    }];

    const query = {
      eq: vi.fn(),
      gte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data, error: null });

    const updateChain = {
      eq: vi.fn(),
      lt: vi.fn(),
    };
    updateChain.eq.mockReturnValue(updateChain);
    updateChain.lt.mockReturnValue(updateChain);

    const update = vi.fn(() => updateChain);
    const select = vi.fn(() => query);
    const from = vi.fn(() => ({ select, update }));
    mockCreateClient.mockResolvedValue({ from } as never);

    await expect(getNotificationCenterData()).resolves.toEqual({
      inbox: [],
      activity: [expect.objectContaining({
        id: "notice-1",
        isRead: false,
      })],
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("counts every active unread notification without list or date limits", async () => {
    const data = [
      ...Array.from({ length: 6 }, (_, index) => ({
        type: "journal_created",
        source_id: `letter-${index + 1}`,
      })),
      { type: "memory_created", source_id: "memory-1" },
      { type: "journal_comment_created", source_id: "comment-1" },
      { type: "unsupported_type", source_id: "other-1" },
    ];
    const query = { eq: vi.fn() };
    query.eq
      .mockReturnValueOnce(query)
      .mockReturnValueOnce(query)
      .mockResolvedValueOnce({ data, error: null });
    const select = vi.fn(() => query);
    const from = vi.fn(() => ({ select }));
    mockCreateClient.mockResolvedValue({ from } as never);

    await expect(getUnreadNotificationState()).resolves.toEqual({
      inboxCount: 6,
      activityCount: 2,
      unreadLetterSourceIds: [
        "letter-1",
        "letter-2",
        "letter-3",
        "letter-4",
        "letter-5",
        "letter-6",
      ],
    });
    expect(from).toHaveBeenCalledWith("notifications");
    expect(select).toHaveBeenCalledWith("type,source_id");
    expect(query.eq).toHaveBeenNthCalledWith(1, "recipient_id", "user-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, "is_read", false);
    expect(query.eq).toHaveBeenNthCalledWith(3, "is_active", true);
  });

  it("does not report mark-read success when no notification row was updated", async () => {
    const query = {
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => query);
    const from = vi.fn(() => ({ update }));
    mockCreateClient.mockResolvedValue({ from } as never);

    await expect(markNotificationReadAction("missing-notification")).resolves.toEqual({
      ok: false,
      message: "通知状态更新失败，请稍后重试。",
    });
    expect(query.select).toHaveBeenCalledWith("id");
  });

  it("allows a withdrawn-letter notification to reach the safe detail state", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "letter-1", withdrawn_at: "2026-07-28T01:00:00Z" }],
      error: null,
    });
    const from = vi.fn(() => query);
    mockCreateClient.mockResolvedValue({ from, rpc } as never);

    await expect(validateJournalEntryForUser("letter-1")).resolves.toEqual({
      ok: true,
      message: "",
    });
    expect(rpc).toHaveBeenCalledWith("get_letter_withdrawal_status", {
      p_entry_id: "letter-1",
    });
  });
});
