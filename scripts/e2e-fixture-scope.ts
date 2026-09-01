export type E2eJournalFixtureRow = {
  id: string;
  author_id: string;
  content: string;
  image_path: string | null;
};

export function selectE2eJournalFixtures(
  rows: E2eJournalFixtureRow[],
  dedicatedUserIds: readonly string[],
  markerPrefix: string,
): E2eJournalFixtureRow[] {
  if (!markerPrefix.startsWith("e2e_")) {
    throw new Error("E2E cleanup marker must start with e2e_");
  }
  const users = new Set(dedicatedUserIds);
  return rows.filter((row) => users.has(row.author_id) && row.content.startsWith(markerPrefix));
}
