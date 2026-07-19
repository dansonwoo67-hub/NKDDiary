import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/features/journal/repository", () => ({ getJournalEntry: vi.fn() }));

import { getJournalEntry } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getReadableImageUrl, uploadJournalImageAction } from "./actions";

const mockGetJournalEntry = vi.mocked(getJournalEntry);
const mockRequireUser = vi.mocked(requireUser);
const mockCreateClient = vi.mocked(createServerSupabaseClient);

const userId = "11111111-1111-4111-8111-111111111111";
const spaceId = "22222222-2222-4222-8222-222222222222";

function imageForm(size = 400 * 1024, type = "image/webp", validWebpHeader = true) {
  const bytes = new Uint8Array(size);
  if (validWebpHeader && size >= 12) {
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  }
  const form = new FormData();
  form.set("image", new File([bytes], "journal.webp", { type }));
  return form;
}

function installClient(rpcResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const upload = vi.fn().mockResolvedValue({ data: { path: "uploaded" }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: null, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.example/signed" },
    error: null,
  });
  const bucket = { upload, remove, createSignedUrl };
  const from = vi.fn((name: string) => {
    if (name !== "journal-images") throw new Error(`unexpected bucket ${name}`);
    return bucket;
  });
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  mockCreateClient.mockResolvedValue({ storage: { from }, rpc } as never);
  return { upload, remove, createSignedUrl, from, rpc };
}

describe("journal image server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ userId, spaceId, profile: {} as never });
  });

  it("derives a private create path from the authenticated space, author, and server entry ID", async () => {
    const client = installClient();

    const result = await uploadJournalImageAction(
      {
        kind: "create-today",
        title: "普通的一天",
        content: "今天一起散步。",
        entryDate: "2026-07-19",
      },
      imageForm(),
    );

    expect(result).toEqual({
      ok: true,
      message: "今天日记已发布。",
      entryId: expect.any(String),
    });
    const rpcArgs = client.rpc.mock.calls[0][1] as Record<string, string>;
    expect(client.rpc).toHaveBeenCalledWith("create_today_diary", expect.any(Object));
    expect(rpcArgs.p_image_path).toBe(`${spaceId}/${userId}/${rpcArgs.p_entry_id}.webp`);
    expect(client.upload).toHaveBeenCalledWith(
      rpcArgs.p_image_path,
      expect.objectContaining({ type: "image/webp" }),
      { contentType: "image/webp", upsert: false },
    );
    expect(JSON.stringify(result)).not.toContain(rpcArgs.p_image_path);
  });

  it("removes an uploaded object when the diary database write fails", async () => {
    const client = installClient({ data: null, error: { code: "42501" } });

    await expect(
      uploadJournalImageAction(
        {
          kind: "create-today",
          title: "普通的一天",
          content: "今天一起散步。",
          entryDate: "2026-07-19",
        },
        imageForm(),
      ),
    ).resolves.toEqual({ ok: false, message: "操作失败，请稍后再试。" });

    const uploadedPath = client.upload.mock.calls[0][0] as string;
    expect(client.remove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("queues orphan cleanup after three inspected remove failures", async () => {
    const client = installClient();
    client.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "42501" } })
      .mockResolvedValueOnce({ data: null, error: null });
    client.remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });

    await expect(uploadJournalImageAction({
      kind: "create-today",
      title: "普通的一天",
      content: "数据库会拒绝。",
      entryDate: "2026-07-19",
    }, imageForm())).resolves.toEqual({ ok: false, message: "操作失败，请稍后再试。" });

    expect(client.remove).toHaveBeenCalledTimes(3);
    expect(client.rpc.mock.calls[1]).toEqual(["enqueue_journal_image_cleanup", {
      p_space_id: spaceId,
      p_entry_id: expect.any(String),
      p_reason: "database_write_failed",
    }]);
  });

  it("returns an actionable safe error when orphan cleanup cannot be queued", async () => {
    const client = installClient();
    client.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "42501" } })
      .mockResolvedValueOnce({ data: null, error: { message: "queue failed" } });
    client.remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });

    await expect(uploadJournalImageAction({
      kind: "create-today",
      title: "普通的一天",
      content: "清理也会失败。",
      entryDate: "2026-07-19",
    }, imageForm())).resolves.toEqual({
      ok: false,
      message: "操作失败，且图片清理未完成，请联系管理员。",
    });
    expect(client.remove).toHaveBeenCalledTimes(3);
  });

  it("uploads a replacement to the existing entry path before updating", async () => {
    const client = installClient();
    const entryId = "33333333-3333-4333-8333-333333333333";
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId: userId,
      entryType: "today",
      imagePath: null,
    } as never);

    await expect(
      uploadJournalImageAction(
        {
          kind: "update-today",
          entryId,
          title: "更新的一天",
          content: "换了一张照片。",
        },
        imageForm(),
      ),
    ).resolves.toEqual({ ok: true, message: "日记已更新。", entryId });

    const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
    expect(client.upload).toHaveBeenCalledWith(imagePath, expect.any(File), {
      contentType: "image/webp",
      upsert: false,
    });
    expect(client.rpc).toHaveBeenCalledWith("update_today_diary", {
      p_entry_id: entryId,
      p_title: "更新的一天",
      p_content: "换了一张照片。",
      p_image_path: imagePath,
    });
  });

  it("uses an authorized upsert when replacing an existing image", async () => {
    const client = installClient();
    const entryId = "33333333-3333-4333-8333-333333333333";
    const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId: userId,
      entryType: "today",
      imagePath,
    } as never);

    await uploadJournalImageAction({
      kind: "update-today",
      entryId,
      title: "更新的一天",
      content: "再次换图。",
    }, imageForm());

    expect(client.upload).toHaveBeenCalledWith(imagePath, expect.any(File), {
      contentType: "image/webp",
      upsert: true,
    });
  });

  it("leaves existing bytes untouched when replacement RPC validation fails", async () => {
    const client = installClient({ data: null, error: { code: "55000" } });
    const entryId = "33333333-3333-4333-8333-333333333333";
    const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId: userId,
      entryType: "today",
      imagePath,
    } as never);

    await expect(uploadJournalImageAction({
      kind: "update-today",
      entryId,
      title: "更新的一天",
      content: "RPC 会拒绝。",
    }, imageForm())).resolves.toEqual({ ok: false, message: "操作失败，请稍后再试。" });

    expect(client.rpc).toHaveBeenCalledOnce();
    expect(client.upload).not.toHaveBeenCalled();
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("leaves existing bytes untouched when replacement RPC throws", async () => {
    const client = installClient();
    client.rpc.mockRejectedValue(new Error("database unavailable"));
    const entryId = "33333333-3333-4333-8333-333333333333";
    const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId: userId,
      entryType: "today",
      imagePath,
    } as never);

    await expect(uploadJournalImageAction({
      kind: "update-today",
      entryId,
      title: "更新的一天",
      content: "RPC 会抛错。",
    }, imageForm())).resolves.toEqual({ ok: false, message: "操作失败，请稍后再试。" });

    expect(client.upload).not.toHaveBeenCalled();
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("keeps existing bytes when replacement upload fails after RPC succeeds", async () => {
    const client = installClient();
    client.upload.mockResolvedValue({ data: null, error: { message: "upload failed" } });
    const entryId = "33333333-3333-4333-8333-333333333333";
    const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId: userId,
      entryType: "today",
      imagePath,
    } as never);

    await expect(uploadJournalImageAction({
      kind: "update-today",
      entryId,
      title: "更新的一天",
      content: "上传会失败。",
    }, imageForm())).resolves.toEqual({
      ok: false,
      message: "日记文字已保存，但图片替换失败，原图片仍保留。",
    });

    expect(client.rpc.mock.invocationCallOrder[0]).toBeLessThan(client.upload.mock.invocationCallOrder[0]);
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("keeps existing bytes when replacement upload throws after RPC succeeds", async () => {
    const client = installClient();
    client.upload.mockRejectedValue(new Error("storage unavailable"));
    const entryId = "33333333-3333-4333-8333-333333333333";
    const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId: userId,
      entryType: "today",
      imagePath,
    } as never);

    await expect(uploadJournalImageAction({
      kind: "update-today",
      entryId,
      title: "更新的一天",
      content: "上传会抛错。",
    }, imageForm())).resolves.toEqual({
      ok: false,
      message: "日记文字已保存，但图片替换失败，原图片仍保留。",
    });

    expect(client.remove).not.toHaveBeenCalled();
  });

  it("replaces existing bytes exactly once after RPC succeeds", async () => {
    const client = installClient();
    const entryId = "33333333-3333-4333-8333-333333333333";
    const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId: userId,
      entryType: "today",
      imagePath,
    } as never);

    await uploadJournalImageAction({
      kind: "update-today",
      entryId,
      title: "更新的一天",
      content: "替换成功。",
    }, imageForm());

    expect(client.rpc.mock.invocationCallOrder[0]).toBeLessThan(client.upload.mock.invocationCallOrder[0]);
    expect(client.upload).toHaveBeenCalledOnce();
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("rejects an extra raw image path in media orchestration input", async () => {
    installClient();

    await expect(uploadJournalImageAction({
      kind: "create-today",
      title: "普通的一天",
      content: "今天一起散步。",
      entryDate: "2026-07-19",
      imagePath: `${spaceId}/${userId}/33333333-3333-4333-8333-333333333333.webp`,
    }, imageForm())).resolves.toEqual({ ok: false, message: "日记内容无效。" });

    expect(mockRequireUser).not.toHaveBeenCalled();
  });

  it("rejects anything other than a compressed WebP before authenticating", async () => {
    installClient();

    await expect(
      uploadJournalImageAction(
        {
          kind: "create-today",
          title: "普通的一天",
          content: "今天一起散步。",
          entryDate: "2026-07-19",
        },
        imageForm(100, "image/png"),
      ),
    ).resolves.toEqual({ ok: false, message: "图片格式或大小无效。" });
    expect(mockRequireUser).not.toHaveBeenCalled();
  });

  it("rejects a spoofed image/webp file without RIFF and WEBP magic bytes", async () => {
    installClient();

    await expect(uploadJournalImageAction({
      kind: "create-today",
      title: "普通的一天",
      content: "今天一起散步。",
      entryDate: "2026-07-19",
    }, imageForm(100, "image/webp", false))).resolves.toEqual({
      ok: false,
      message: "图片格式或大小无效。",
    });
    expect(mockRequireUser).not.toHaveBeenCalled();
  });

  it("does not request a signed URL when full-content permission hides the entry", async () => {
    const client = installClient();
    mockGetJournalEntry.mockResolvedValue(null);

    await expect(
      getReadableImageUrl("33333333-3333-4333-8333-333333333333"),
    ).resolves.toBeNull();

    expect(mockGetJournalEntry).toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("signs an authorized private image for exactly 300 seconds", async () => {
    const client = installClient();
    const entryId = "33333333-3333-4333-8333-333333333333";
    const imagePath = `${spaceId}/${userId}/${entryId}.webp`;
    mockGetJournalEntry.mockResolvedValue({
      id: entryId,
      spaceId,
      authorId: userId,
      recipientId: null,
      entryType: "today",
      title: "普通的一天",
      content: "今天一起散步。",
      imagePath,
      entryDate: "2026-07-19",
      publishedAt: "2026-07-19T10:00:00Z",
      updatedAt: "2026-07-19T10:00:00Z",
      lockedAt: "2026-07-20T10:00:00Z",
      sealedAt: null,
      openAt: null,
      openedAt: null,
    });

    await expect(
      getReadableImageUrl("33333333-3333-4333-8333-333333333333"),
    ).resolves.toBe("https://storage.example/signed");

    expect(client.createSignedUrl).toHaveBeenCalledWith(imagePath, 300);
  });

  it("refuses to sign a legacy path that does not belong to the authorized entry", async () => {
    const client = installClient();
    mockGetJournalEntry.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      spaceId,
      authorId: userId,
      imagePath: `${spaceId}/another-author/another-entry.webp`,
    } as never);

    await expect(
      getReadableImageUrl("33333333-3333-4333-8333-333333333333"),
    ).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});
