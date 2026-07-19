import { describe, expect, it, vi } from "vitest";
import {
  cleanupJournalImage,
  enqueueJournalImageReconciliation,
} from "./storage-cleanup";

const target = {
  spaceId: "22222222-2222-4222-8222-222222222222",
  authorId: "11111111-1111-4111-8111-111111111111",
  entryId: "33333333-3333-4333-8333-333333333333",
  reason: "database_write_failed" as const,
};

function installClient() {
  const remove = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn(() => ({ remove }));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { client: { storage: { from }, rpc } as never, remove, from, rpc };
}

describe("cleanupJournalImage", () => {
  it("stops after the first successful removal", async () => {
    const { client, remove, rpc } = installClient();

    await expect(cleanupJournalImage(client, target)).resolves.toBe("removed");

    expect(remove).toHaveBeenCalledWith([
      `${target.spaceId}/${target.authorId}/${target.entryId}.webp`,
    ]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("retries removal three times before durably enqueueing reconciliation", async () => {
    const { client, remove, rpc } = installClient();
    remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });

    await expect(cleanupJournalImage(client, target)).resolves.toBe("queued");

    expect(remove).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledWith("enqueue_journal_image_cleanup", {
      p_space_id: target.spaceId,
      p_entry_id: target.entryId,
      p_reason: target.reason,
    });
  });

  it("treats thrown remove failures as inspected attempts and enqueues them", async () => {
    const { client, remove, rpc } = installClient();
    remove.mockRejectedValue(new Error("storage unavailable"));

    await expect(cleanupJournalImage(client, target)).resolves.toBe("queued");

    expect(remove).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("returns an explicit failed state when durable enqueueing also fails", async () => {
    const { client, remove, rpc } = installClient();
    remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });
    rpc.mockResolvedValue({ data: null, error: { message: "queue failed" } });

    await expect(cleanupJournalImage(client, target)).resolves.toBe("failed");

    expect(remove).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledOnce();
  });
});

describe("enqueueJournalImageReconciliation", () => {
  it("queues a scoped backup restore without deleting the retained backup", async () => {
    const { client, remove, rpc } = installClient();
    const backupId = "44444444-4444-4444-8444-444444444444";

    await expect(enqueueJournalImageReconciliation(client, {
      ...target,
      reason: "replacement_restore_failed",
      backupId,
    })).resolves.toBe("queued");

    expect(remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("enqueue_journal_image_cleanup", {
      p_space_id: target.spaceId,
      p_entry_id: target.entryId,
      p_reason: "replacement_restore_failed",
      p_backup_id: backupId,
    });
  });

  it("reports an enqueue failure explicitly", async () => {
    const { client, rpc } = installClient();
    rpc.mockRejectedValue(new Error("database unavailable"));

    await expect(enqueueJournalImageReconciliation(client, {
      ...target,
      reason: "replacement_restore_failed",
      backupId: "44444444-4444-4444-8444-444444444444",
    })).resolves.toBe("failed");
  });
});
