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
  const copy = vi.fn().mockResolvedValue({ data: { path: "copied" }, error: null });
  const download = vi.fn().mockResolvedValue({
    data: new Blob(["old image"], { type: "image/webp" }),
    error: null,
  });
  const remove = vi.fn().mockResolvedValue({ data: null, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.example/signed" },
    error: null,
  });
  const bucket = { upload, copy, download, remove, createSignedUrl };
  const from = vi.fn((name: string) => {
    if (name !== "journal-images") throw new Error(`unexpected bucket ${name}`);
    return bucket;
  });
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  mockCreateClient.mockResolvedValue({ storage: { from }, rpc } as never);
  return { upload, copy, download, remove, createSignedUrl, from, rpc };
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

  it("seals a future diary image through the same server-derived path orchestration", async () => {
    const client = installClient();
    const recipientId = "33333333-3333-4333-8333-333333333333";

    const result = await uploadJournalImageAction({
      kind: "seal-future",
      title: "写给以后",
      content: "到那天再读。",
      recipientId,
      openAt: "2099-08-01T12:30:00.000Z",
    }, imageForm());

    expect(result).toEqual({ ok: true, message: "胶囊信已封存，会在约定时间送到 TA 手中。", entryId: expect.any(String) });
    const rpcArgs = client.rpc.mock.calls[0][1] as Record<string, string>;
    expect(client.rpc).toHaveBeenCalledWith("seal_future_diary_with_image", expect.objectContaining({
      p_space_id: spaceId,
      p_recipient_id: recipientId,
      p_open_at: "2099-08-01T12:30:00.000Z",
      p_entry_id: expect.any(String),
    }));
    expect(rpcArgs.p_image_path).toBe(`${spaceId}/${userId}/${rpcArgs.p_entry_id}.webp`);
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
    ).resolves.toEqual({ ok: false, message: "刚刚没有成功，请别担心，内容还在这里。稍后再试一次就好啦。" });

    const uploadedPath = client.upload.mock.calls[0][0] as string;
    expect(client.remove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("cleans a possibly committed initial upload when Storage throws", async () => {
    const client = installClient();
    client.upload.mockRejectedValue(new Error("connection lost after request"));

    await expect(uploadJournalImageAction({
      kind: "create-today",
      title: "普通的一天",
      content: "上传结果不明。",
      entryDate: "2026-07-19",
    }, imageForm())).resolves.toEqual({ ok: false, message: "图片上传没有成功，请稍后再试。" });

    expect(client.remove).toHaveBeenCalledOnce();
    expect(client.rpc).not.toHaveBeenCalledWith("create_today_diary", expect.anything());
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
    }, imageForm())).resolves.toEqual({ ok: false, message: "刚刚没有成功，请别担心，内容还在这里。稍后再试一次就好啦。" });

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
      message: "刚刚没有成功，且图片清理未完成，请稍后再试。",
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
    }, imageForm())).resolves.toEqual({ ok: false, message: "刚刚没有成功，请别担心，内容还在这里。稍后再试一次就好啦。" });

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
    }, imageForm())).resolves.toEqual({ ok: false, message: "刚刚没有成功，请别担心，内容还在这里。稍后再试一次就好啦。" });

    expect(client.upload).not.toHaveBeenCalled();
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("removes the backup after a failed replacement is successfully restored", async () => {
    const client = installClient();
    client.upload
      .mockResolvedValueOnce({ data: null, error: { message: "upload failed" } })
      .mockResolvedValueOnce({ data: { path: "restored" }, error: null });
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
      message: "日记文字已保存，但图片替换没有成功，原图片仍保留。",
    });

    expect(client.rpc.mock.invocationCallOrder[0]).toBeLessThan(client.upload.mock.invocationCallOrder[0]);
    expect(client.copy).toHaveBeenNthCalledWith(1, imagePath, expect.stringContaining(`/.backups/${entryId}/`));
    const backupPath = client.copy.mock.calls[0][1] as string;
    expect(client.download).toHaveBeenCalledWith(backupPath);
    expect(client.upload).toHaveBeenNthCalledWith(2, imagePath, expect.any(Blob), {
      contentType: "image/webp",
      upsert: true,
    });
    expect(client.remove).toHaveBeenCalledWith([backupPath]);
  });

  it("reports durable queued cleanup after a failed replacement is successfully restored", async () => {
    const client = installClient();
    client.remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });
    client.upload
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce({ data: { path: "restored" }, error: null });
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
      message: "日记文字已保存，但图片替换没有成功，原图片仍保留；旧图备份清理已进入队列。",
    });

    const backupPath = client.copy.mock.calls[0][1] as string;
    const backupId = backupPath.split("/").at(-1)?.replace(".webp", "");
    expect(client.download).toHaveBeenCalledWith(backupPath);
    expect(client.upload).toHaveBeenNthCalledWith(2, imagePath, expect.any(Blob), {
      contentType: "image/webp",
      upsert: true,
    });
    expect(client.remove).toHaveBeenCalledTimes(3);
    expect(client.rpc).toHaveBeenLastCalledWith("enqueue_journal_image_cleanup", {
      p_space_id: spaceId,
      p_entry_id: entryId,
      p_reason: "backup_cleanup_failed",
      p_backup_id: backupId,
    });
  });

  it("warns when a restored replacement backup cannot be removed or queued", async () => {
    const client = installClient();
    client.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "queue failed" } });
    client.remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });
    client.upload
      .mockResolvedValueOnce({ data: null, error: { message: "upload failed" } })
      .mockResolvedValueOnce({ data: { path: "restored" }, error: null });
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
      content: "恢复后清理失败。",
    }, imageForm())).resolves.toEqual({
      ok: false,
      message: "日记文字已保存，原图片已恢复，但旧图备份清理未完成，请稍后再试。",
    });

    expect(client.remove).toHaveBeenCalledTimes(3);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps the backup and queues restore when canonical upload and restore are ambiguous", async () => {
    const client = installClient();
    client.upload
      .mockRejectedValueOnce(new Error("canonical result unknown"))
      .mockRejectedValueOnce(new Error("restore result unknown"));
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
      content: "恢复结果也不明。",
    }, imageForm())).resolves.toEqual({
      ok: false,
      message: "图片替换没有确认，旧图备份已保留并进入恢复队列。",
    });

    const backupPath = client.copy.mock.calls[0][1] as string;
    const backupId = backupPath.split("/").at(-1)?.replace(".webp", "");
    expect(client.remove).not.toHaveBeenCalled();
    expect(client.download).toHaveBeenCalledWith(backupPath);
    expect(client.rpc).toHaveBeenLastCalledWith("enqueue_journal_image_cleanup", {
      p_space_id: spaceId,
      p_entry_id: entryId,
      p_reason: "replacement_restore_failed",
      p_backup_id: backupId,
    });
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

    expect(client.rpc.mock.invocationCallOrder[0]).toBeLessThan(client.copy.mock.invocationCallOrder[0]);
    expect(client.copy.mock.invocationCallOrder[0]).toBeLessThan(client.upload.mock.invocationCallOrder[0]);
    const backupPath = client.copy.mock.calls[0][1] as string;
    expect(backupPath).toMatch(new RegExp(`^${spaceId}/${userId}/\\.backups/${entryId}/[0-9a-f-]{36}\\.webp$`));
    expect(client.upload).toHaveBeenCalledOnce();
    expect(client.remove).toHaveBeenCalledWith([backupPath]);
  });

  it("warns when a confirmed replacement backup cannot be removed or queued", async () => {
    const client = installClient();
    client.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "queue failed" } });
    client.remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });
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
      content: "替换成功但清理失败。",
    }, imageForm())).resolves.toEqual({
      ok: true,
      message: "日记已更新，但旧图备份清理未完成，请稍后再试。",
      entryId,
    });

    expect(client.remove).toHaveBeenCalledTimes(3);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects an extra raw image path in media orchestration input", async () => {
    installClient();

    await expect(uploadJournalImageAction({
      kind: "create-today",
      title: "普通的一天",
      content: "今天一起散步。",
      entryDate: "2026-07-19",
      imagePath: `${spaceId}/${userId}/33333333-3333-4333-8333-333333333333.webp`,
    }, imageForm())).resolves.toEqual({ ok: false, message: "日记内容需要重新检查一下哦。" });

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
    ).resolves.toEqual({ ok: false, message: "图片格式或大小需要调整一下哦。" });
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
      message: "图片格式或大小需要调整一下哦。",
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
