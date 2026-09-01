import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, revalidatePath } = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn().mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    spaceId: "22222222-2222-4222-8222-222222222222",
    email: "user@example.test",
    profile: {},
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({ rpc }),
}));

import { replyToLetterAction, resendWithdrawnLetterAction, withdrawLetterAction } from "./letter-actions";

const entryId = "33333333-3333-4333-8333-333333333333";

describe("withdrawLetterAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: null, error: null });
  });

  it("keeps successful withdrawal behavior", async () => {
    await expect(withdrawLetterAction(entryId)).resolves.toEqual({
      ok: true,
      message: "信件已撤回。",
      entryId: undefined,
    });
  });

  it.each([
    ["letter already read", "对方已经读过这封信，不能再撤回了。"],
    ["letter already withdrawn", "这封信已经撤回了。"],
    ["capsule letters cannot be withdrawn", "胶囊信封存后不能撤回。"],
    ["letter not found or unauthorized", "没有找到可撤回的信件。"],
    ["letter withdraw window closed", "这封信寄出已经超过 24 小时啦，现在会安心留在彼此的信箱里。"],
  ])("maps %s to a product error", async (databaseMessage, productMessage) => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: databaseMessage } });

    await expect(withdrawLetterAction(entryId)).resolves.toEqual({
      ok: false,
      message: productMessage,
      entryId: undefined,
    });
  });
});

describe("letter thread write actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: entryId, error: null });
  });

  const input = {
    html: "<p>回信</p>",
    text: "回信",
    stationeryTheme: "cream",
  };

  it("forwards a reply only through the atomic reply RPC", async () => {
    await expect(replyToLetterAction(entryId, input)).resolves.toEqual({
      ok: true,
      message: "回信已寄出。",
      entryId,
    });
    expect(rpc).toHaveBeenCalledWith("reply_to_letter", expect.objectContaining({
      p_target_id: entryId,
      p_plain_text: "回信",
    }));
  });

  it("forwards a resend only through the atomic resend RPC", async () => {
    await expect(resendWithdrawnLetterAction(entryId, input)).resolves.toEqual({
      ok: true,
      message: "新信已寄出，原撤回记录保持不变。",
      entryId,
    });
    expect(rpc).toHaveBeenCalledWith("resend_withdrawn_letter", expect.objectContaining({
      p_withdrawn_id: entryId,
      p_plain_text: "回信",
    }));
  });
});
