type CleanupReason =
  | "database_write_failed"
  | "diary_deleted"
  | "backup_cleanup_failed"
  | "replacement_restore_failed";

type CleanupTarget = {
  spaceId: string;
  authorId: string;
  entryId: string;
  reason: CleanupReason;
  backupId?: string;
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

export async function enqueueJournalImageReconciliation(
  client: CleanupClient,
  target: CleanupTarget,
): Promise<Exclude<CleanupOutcome, "removed">> {
  const args: Record<string, string> = {
    p_space_id: target.spaceId,
    p_entry_id: target.entryId,
    p_reason: target.reason,
  };
  if (target.backupId) args.p_backup_id = target.backupId;

  try {
    const { error } = await client.rpc("enqueue_journal_image_cleanup", args);
    return error ? "failed" : "queued";
  } catch {
    return "failed";
  }
}

export async function cleanupJournalImage(
  client: CleanupClient,
  target: CleanupTarget,
): Promise<CleanupOutcome> {
  const imagePath = target.backupId
    ? `${target.spaceId}/${target.authorId}/.backups/${target.entryId}/${target.backupId}.webp`
    : `${target.spaceId}/${target.authorId}/${target.entryId}.webp`;
  const bucket = client.storage.from("journal-images");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await bucket.remove([imagePath]);
      if (!error) return "removed";
    } catch {
      // The failed attempt is counted and retried below.
    }
  }

  return enqueueJournalImageReconciliation(client, target);
}
