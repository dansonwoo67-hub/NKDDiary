import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("./repository", () => ({ getJournalEntry: vi.fn() }));

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getJournalEntry } from "./repository";
import {
  createTodayDiaryAction,
  deleteTodayDiaryAction,
  openFutureDiaryAction,
  sealFutureDiaryAction,
  updateTodayDiaryAction,
} from "./actions";

const mockRequireUser = vi.mocked(requireUser);
const mockCreateClient = vi.mocked(createServerSupabaseClient);
const mockRevalidatePath = vi.mocked(revalidatePath);
const mockGetJournalEntry = vi.mocked(getJournalEntry);

function installClient(result: { data: unknown; error: unknown } = { data: { id: "entry-1" }, error: null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const remove = vi.fn().mockResolvedValue({ data: null, error: null });
  const storageFrom = vi.fn(() => ({ remove }));
  const from = vi.fn(() => {
    throw new Error("journal actions must call database functions, not tables");
  });
  mockCreateClient.mockResolvedValue({ rpc, from, storage: { from: storageFrom } } as never);
  return { rpc, from, remove, storageFrom };
}

describe("journal server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      spaceId: "22222222-2222-4222-8222-222222222222",
      email: "user@example.test",
      profile: {} as never,
    });
    mockGetJournalEntry.mockResolvedValue({ imagePath: null } as never);
  });

  it("seals a validated future diary through the narrow database function", async () => {
    const { rpc, from } = installClient();
    const input = {
      content: "  Open this together  ",
      recipientId: "33333333-3333-4333-8333-333333333333",
      openAt: "2099-08-01T20:00:00+08:00",
    };

    await expect(sealFutureDiaryAction(input)).resolves.toEqual({
      ok: true,
      message: "胶囊信已封存，会在约定时间送到 TA 手中。",
      entryId: "entry-1",
    });
    expect(rpc).toHaveBeenCalledWith("seal_future_diary", {
      p_space_id: "22222222-2222-4222-8222-222222222222",
      p_title: "",
      p_content: "Open this together",
      p_recipient_id: "33333333-3333-4333-8333-333333333333",
      p_open_at: "2099-08-01T20:00:00+08:00",
      p_image_path: null,
    });
    expect(from).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/journal/future");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/journal/entry-1");
  });

  it("rejects invalid future content before authenticating or calling the database", async () => {
    const { rpc } = installClient();

    const result = await sealFutureDiaryAction({
      content: "body",
      recipientId: "not-a-uuid",
      openAt: "2026-08-01T12:00:00Z",
    });

    expect(result.ok).toBe(false);
    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-future opening time on the server", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));
    const { rpc } = installClient();

    await expect(sealFutureDiaryAction({
      content: "Open this together",
      recipientId: "33333333-3333-4333-8333-333333333333",
      openAt: "2026-08-01T12:00:00Z",
    })).resolves.toEqual({ ok: false, message: "这个时间已经悄悄过去啦，帮小胶囊选一个未来的时间吧。" });
    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("rejects an impossible calendar opening time on the server", async () => {
    const { rpc } = installClient();
    await expect(sealFutureDiaryAction({
      content: "Open this together",
      recipientId: "33333333-3333-4333-8333-333333333333",
      openAt: "2099-02-30T12:00:00Z",
    })).resolves.toEqual({ ok: false, message: "胶囊信内容需要重新检查一下哦。" });
    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the future quota unique violation without leaking database details", async () => {
    installClient({
      data: null,
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint one_future_diary_per_author_creation_date",
      },
    });

    await expect(
      sealFutureDiaryAction({
        content: "Open this together",
        recipientId: "33333333-3333-4333-8333-333333333333",
        openAt: "2099-08-01T20:00:00+08:00",
      }),
    ).resolves.toEqual({ ok: false, message: "今天已经封存过一封胶囊信了，明天再继续写吧。" });
  });

  it("maps the today quota only when the known partial index is identified", async () => {
    installClient({
      data: null,
      error: {
        code: "23505",
        constraint: "one_today_diary_per_author_date",
        message: "duplicate key",
      },
    });

    await expect(
      createTodayDiaryAction({
        title: "Today",
        content: "A good day",
        entryDate: "2026-07-19",
      }),
    ).resolves.toEqual({ ok: false, message: "今天已经写过一篇日记了，明天再继续记录我们的故事吧。" });
  });

  it("does not label an unrelated unique violation as a diary quota", async () => {
    installClient({
      data: null,
      error: {
        code: "23505",
        details: "constraint profiles_login_name_key",
        message: "duplicate key",
      },
    });

    await expect(
      sealFutureDiaryAction({
        content: "Open this together",
        recipientId: "33333333-3333-4333-8333-333333333333",
        openAt: "2099-08-01T20:00:00+08:00",
      }),
    ).resolves.toEqual({ ok: false, message: "刚刚没有成功，请别担心，内容还在这里。稍后再试一次就好啦。" });
  });

  it("creates, updates, opens, and deletes only through lifecycle RPCs", async () => {
    const { rpc, from } = installClient();

    await createTodayDiaryAction({
      title: "Today",
      content: "A good day",
      entryDate: "2026-07-19",
    });
    await updateTodayDiaryAction("44444444-4444-4444-8444-444444444444", {
      title: "Updated",
      content: "Updated body",
    });
    await openFutureDiaryAction("55555555-5555-4555-8555-555555555555");
    await deleteTodayDiaryAction("44444444-4444-4444-8444-444444444444");

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "create_today_diary",
      "update_today_diary",
      "open_future_diary",
      "delete_today_diary",
    ]);
    expect(from).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/journal");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/journal/future");
  });

  it("rejects raw permanent image paths supplied to public diary actions", async () => {
    const { rpc } = installClient();
    const imagePath = "22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.webp";

    await expect(createTodayDiaryAction({
      title: "Today",
      content: "A good day",
      entryDate: "2026-07-19",
      imagePath,
    })).resolves.toEqual({ ok: false, message: "日记内容需要重新检查一下哦。" });
    await expect(sealFutureDiaryAction({
      content: "Open this together",
      recipientId: "33333333-3333-4333-8333-333333333333",
      openAt: "2099-08-01T20:00:00+08:00",
      imagePath,
    })).resolves.toEqual({ ok: false, message: "胶囊信内容需要重新检查一下哦。" });
    await expect(updateTodayDiaryAction("44444444-4444-4444-8444-444444444444", {
      title: "Updated",
      content: "Updated body",
      imagePath,
    })).resolves.toEqual({ ok: false, message: "日记内容需要重新检查一下哦。" });

    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves an existing image path server-side when a text-only update omits it", async () => {
    const { rpc } = installClient();
    mockGetJournalEntry.mockResolvedValue({ imagePath: "space-1/author-1/private-photo.webp" } as never);

    await updateTodayDiaryAction("44444444-4444-4444-8444-444444444444", {
      title: "Updated",
      content: "Updated body",
    });

    expect(mockGetJournalEntry).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("update_today_diary", {
      p_entry_id: "44444444-4444-4444-8444-444444444444",
      p_title: "Updated",
      p_content: "Updated body",
      p_image_path: "space-1/author-1/private-photo.webp",
    });
  });

  it("deletes the database row before removing its captured canonical image", async () => {
    const { rpc, remove } = installClient();
    const entryId = "44444444-4444-4444-8444-444444444444";
    const spaceId = "22222222-2222-4222-8222-222222222222";
    const authorId = "11111111-1111-4111-8111-111111111111";
    const imagePath = `${spaceId}/${authorId}/${entryId}.webp`;
    mockGetJournalEntry.mockResolvedValue({ id: entryId, spaceId, authorId, imagePath } as never);

    await expect(deleteTodayDiaryAction(entryId)).resolves.toEqual({
      ok: true,
      message: "日记已删除。",
      entryId,
    });

    expect(rpc).toHaveBeenCalledWith("delete_today_diary", { p_entry_id: entryId });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
    expect(remove).toHaveBeenCalledWith([imagePath]);
  });

  it("does not remove image bytes when diary deletion is rejected", async () => {
    const { remove } = installClient({ data: null, error: { code: "55000" } });
    const entryId = "44444444-4444-4444-8444-444444444444";
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId: "22222222-2222-4222-8222-222222222222",
      authorId: "11111111-1111-4111-8111-111111111111",
      imagePath: "22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.webp",
    } as never);

    await deleteTodayDiaryAction(entryId);

    expect(remove).not.toHaveBeenCalled();
  });

  it("queues image reconciliation after a successful diary delete and three cleanup failures", async () => {
    const { rpc, remove } = installClient();
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });
    const entryId = "44444444-4444-4444-8444-444444444444";
    const spaceId = "22222222-2222-4222-8222-222222222222";
    const authorId = "11111111-1111-4111-8111-111111111111";
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId,
      imagePath: `${spaceId}/${authorId}/${entryId}.webp`,
    } as never);

    await expect(deleteTodayDiaryAction(entryId)).resolves.toEqual({
      ok: true,
      message: "日记已删除，图片清理已进入重试队列。",
      entryId,
    });

    expect(remove).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenLastCalledWith("enqueue_journal_image_cleanup", {
      p_space_id: spaceId,
      p_entry_id: entryId,
      p_reason: "diary_deleted",
    });
  });

  it("returns an actionable safe failure if deleted-image reconciliation cannot be recorded", async () => {
    const { rpc, remove } = installClient();
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "queue failed" } });
    remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });
    const entryId = "44444444-4444-4444-8444-444444444444";
    const spaceId = "22222222-2222-4222-8222-222222222222";
    const authorId = "11111111-1111-4111-8111-111111111111";
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId,
      imagePath: `${spaceId}/${authorId}/${entryId}.webp`,
    } as never);

    await expect(deleteTodayDiaryAction(entryId)).resolves.toEqual({
      ok: false,
      message: "日记已删除，但图片清理未完成，请稍后再试。",
    });
    expect(remove).toHaveBeenCalledTimes(3);
  });
});
