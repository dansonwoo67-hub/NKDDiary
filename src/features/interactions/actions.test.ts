import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createAnnotationAction,
  createCommentAction,
  createReplyAction,
  deleteCommentAction,
  updateCommentAction,
} from "./actions";

const mockRequireUser = vi.mocked(requireUser);
const mockCreateClient = vi.mocked(createServerSupabaseClient);
const entryId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

function installClient(error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: { id: itemId }, error });
  mockCreateClient.mockResolvedValue({ rpc } as never);
  return rpc;
}

describe("journal interaction actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ userId: itemId } as never);
  });

  it("creates a comment through the narrow RPC after grapheme validation", async () => {
    const rpc = installClient();
    const body = "❤️".repeat(200);

    await expect(createCommentAction({ entryId, body })).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("create_journal_comment", {
      p_entry_id: entryId,
      p_body: body,
    });
  });

  it("rejects an over-limit comment before authentication", async () => {
    const rpc = installClient();

    await expect(createCommentAction({ entryId, body: "❤️".repeat(201) })).resolves.toEqual({
      ok: false,
      message: "评论不能超过 200 个字符。",
    });
    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes a stable body-block annotation anchor to the validating RPC", async () => {
    const rpc = installClient();

    await expect(createAnnotationAction({
      entryId,
      blockId: "body",
      startOffset: 2,
      endOffset: 4,
      quotedText: "一起",
      comment: "我也记得。",
    })).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("create_journal_annotation", {
      p_entry_id: entryId,
      p_block_id: "body",
      p_start_offset: 2,
      p_end_offset: 4,
      p_quoted_text: "一起",
      p_comment: "我也记得。",
    });
  });

  it("rejects forged blocks and invalid offsets before authentication", async () => {
    const rpc = installClient();

    const result = await createAnnotationAction({
      entryId,
      blockId: "title",
      startOffset: 4,
      endOffset: 2,
      quotedText: "标题",
      comment: "不允许",
    });

    expect(result.ok).toBe(false);
    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses only RPCs for comment edits, deletes, and annotation replies", async () => {
    const rpc = installClient();

    await updateCommentAction({ commentId: itemId, entryId, body: "更新" });
    await deleteCommentAction({ commentId: itemId, entryId });
    await createReplyAction({ annotationId: itemId, entryId, body: "回复" });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "update_journal_comment",
      "delete_journal_comment",
      "create_annotation_reply",
    ]);
  });

  it("does not leak database errors", async () => {
    installClient({ message: "private table detail" });
    await expect(createCommentAction({ entryId, body: "你好" })).resolves.toEqual({
      ok: false,
      message: "操作失败，请稍后再试。",
    });
  });
});
