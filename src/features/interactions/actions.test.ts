import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleSupabaseClient: vi.fn() }));

import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  createAnnotationAction,
  createCommentAction,
  createReplyAction,
  deleteCommentAction,
  updateCommentAction,
} from "./actions";

const mockRequireUser = vi.mocked(requireUser);
const mockCreateClient = vi.mocked(createServerSupabaseClient);
const mockCreateServiceClient = vi.mocked(createServiceRoleSupabaseClient);
const entryId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

function installClient(error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: { id: itemId }, error });
  mockCreateClient.mockResolvedValue({ rpc } as never);
  return rpc;
}

function installServiceClient(error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: { id: itemId }, error });
  mockCreateServiceClient.mockResolvedValue({ rpc } as never);
  return rpc;
}

describe("journal interaction actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ userId: itemId } as never);
  });

  it("creates a comment through the narrow RPC after grapheme validation", async () => {
    const rpc = installServiceClient();
    const body = "❤️".repeat(200);

    await expect(createCommentAction({ entryId, body })).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("create_journal_comment", {
      p_entry_id: entryId,
      p_body: body,
      p_actor_id: itemId,
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("rejects an over-limit comment before authentication", async () => {
    const rpc = installServiceClient();

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
    const serviceRpc = installServiceClient();

    await updateCommentAction({ commentId: itemId, entryId, body: "更新" });
    await deleteCommentAction({ commentId: itemId, entryId });
    await createReplyAction({ annotationId: itemId, entryId, body: "回复" });

    expect(serviceRpc).toHaveBeenCalledWith("update_journal_comment", {
      p_actor_id: itemId,
      p_comment_id: itemId,
      p_body: "更新",
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["delete_journal_comment", "create_annotation_reply"]);
  });

  it("does not leak database errors", async () => {
    installServiceClient({ message: "private table detail" });
    await expect(createCommentAction({ entryId, body: "你好" })).resolves.toEqual({
      ok: false,
      message: "请稍等，好像出了点小问题。",
    });
  });

  it("fails safely when the service-role client is unavailable", async () => {
    mockCreateServiceClient.mockRejectedValue(new Error("SUPABASE_SERVICE_ROLE_KEY is missing"));

    await expect(createCommentAction({ entryId, body: "你好" })).resolves.toEqual({
      ok: false,
      message: "请稍等，好像出了点小问题。",
    });
    expect(mockRequireUser).toHaveBeenCalledOnce();
  });
});
