type CleanupReason = "database_write_failed" | "diary_deleted";

type CleanupTarget = {
  spaceId: string;
  authorId: string;
  entryId: string;
  reason: CleanupReason;
};

type CleanupClient = {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): PromiseLike<{ error: unknown }>;
    };
  };
  rpc(
    name: string,
    args: Record<string, string>,
  ): PromiseLike<{ error: unknown }>;
};

export type CleanupOutcome = "removed" | "queued" | "failed";

export async function cleanupJournalImage(
  client: CleanupClient,
  target: CleanupTarget,
): Promise<CleanupOutcome> {
  const imagePath = `${target.spaceId}/${target.authorId}/${target.entryId}.webp`;
  const bucket = client.storage.from("journal-images");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await bucket.remove([imagePath]);
      if (!error) return "removed";
    } catch {
      // The failed attempt is counted and retried below.
    }
  }

  try {
    const { error } = await client.rpc("enqueue_journal_image_cleanup", {
      p_space_id: target.spaceId,
      p_entry_id: target.entryId,
      p_reason: target.reason,
    });
    return error ? "failed" : "queued";
  } catch {
    return "failed";
  }
}
