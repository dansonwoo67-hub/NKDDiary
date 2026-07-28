import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, revalidatePath } = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: "user-1", spaceId: "space-1" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ rpc }),
}));

import { validateMoodInput } from "./rules";
import { createMoodAction, deleteMoodAction, updateMoodAction } from "./actions";

describe("mood validation", () => {
  it("accepts text, emoji, or both in one value", () => {
    expect(validateMoodInput("想你了🥰")).toEqual({ content: "想你了🥰" });
    expect(validateMoodInput("🌙")).toEqual({ content: "🌙" });
  });

  it("rejects empty and overlong entries", () => {
    expect(validateMoodInput(" ")).toBeNull();
    expect(validateMoodInput("心".repeat(16))).toBeNull();
  });
});

describe("mood mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ error: null });
  });

  it("stores unified content through the current homepage mood RPC", async () => {
    await expect(createMoodAction({ content: "想你🥰" })).resolves.toEqual({
      ok: true,
      message: "这份心情，已经被轻轻记下。",
    });
    expect(rpc).toHaveBeenCalledWith("create_home_mood", {
      p_space_id: "space-1",
      p_body: "想你🥰",
      p_source: "manual",
    });
  });

  it("rejects overlong content before touching the database", async () => {
    await expect(createMoodAction({ content: "心".repeat(16) })).resolves.toEqual({
      ok: false,
      message: "纸短情长，15 个字刚刚好。",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses protected RPCs for update and delete", async () => {
    await expect(updateMoodAction({ id: "mood-1", content: "开心" })).resolves.toEqual({
      ok: true,
      message: "心情已更新。",
    });
    expect(rpc).toHaveBeenCalledWith("update_mood_entry", { p_id: "mood-1", p_body: "开心" });

    await expect(deleteMoodAction("mood-1")).resolves.toEqual({
      ok: true,
      message: "心情已删除。",
    });
    expect(rpc).toHaveBeenCalledWith("delete_mood_entry", { p_id: "mood-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/memories");
  });
});
