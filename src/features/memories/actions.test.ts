import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, upload, remove, revalidatePath, from, select, lt } = vi.hoisted(() => {
  const lt = vi.fn();
  const gte = vi.fn(() => ({ lt }));
  const eq = vi.fn(() => ({ gte }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  revalidatePath: vi.fn(),
    from,
    select,
    lt,
  };
});

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111", spaceId: "22222222-2222-4222-8222-222222222222" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    rpc,
    from,
    storage: { from: () => ({ upload, remove }) },
  }),
}));

import { getMemoryDayBounds } from "./day-bounds";
import { createMemoryAction, deleteMemoryAction, updateMemoryAction } from "./actions";

describe("memory actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: null, error: null });
    upload.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: null });
    lt.mockResolvedValue({ count: 0, error: null });
  });

  it("creates a text memory through the guarded RPC", async () => {
    const form = new FormData();
    form.set("title", "海边");
    form.set("body", "一起看海");
    form.set("occurredOn", "2026-07-20");

    await expect(createMemoryAction(form)).resolves.toEqual({ ok: true, message: "这段回忆已经长在树上啦。" });
    expect(from).toHaveBeenCalledWith("memory_entries");
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(rpc).toHaveBeenCalledWith("create_memory_entry", expect.objectContaining({
      p_space_id: "22222222-2222-4222-8222-222222222222",
      p_title: "海边",
      p_body: "一起看海",
      p_occurred_on: "2026-07-20",
      p_image_path: null,
    }));
    expect(upload).not.toHaveBeenCalled();
  });

  it("uses Taipei business-day bounds when UTC still shows the previous day", () => {
    expect(getMemoryDayBounds(new Date("2026-08-28T16:01:00Z"))).toEqual({
      start: "2026-08-28T16:00:00.000Z",
      end: "2026-08-29T16:00:00.000Z",
    });
  });

  it("rejects invalid input without creating data", async () => {
    const form = new FormData();
    form.set("title", "");
    form.set("occurredOn", "not-a-date");

    await expect(createMemoryAction(form)).resolves.toEqual({ ok: false, message: "回忆正文请控制在 150 字内，并选择有效日期。" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses guarded RPCs for update and delete and removes the returned private image", async () => {
    await expect(updateMemoryAction({
      id: "memory-1",
      title: "新标题",
      body: "一起看海",
      occurredOn: "2026-07-20",
    })).resolves.toEqual({ ok: true, message: "回忆已更新。" });
    expect(rpc).toHaveBeenCalledWith("update_memory_entry", {
      p_id: "memory-1",
      p_title: "新标题",
      p_body: "一起看海",
      p_occurred_on: "2026-07-20",
    });

    rpc.mockResolvedValueOnce({ data: "space/user/memory.webp", error: null });
    await expect(deleteMemoryAction("memory-1")).resolves.toEqual({ ok: true, message: "回忆已删除。" });
    expect(remove).toHaveBeenCalledWith(["space/user/memory.webp"]);
    expect(revalidatePath).toHaveBeenCalledWith("/memories");
  });
});
