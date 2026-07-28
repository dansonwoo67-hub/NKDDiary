export function getJournalAccountStateKey(
  userId: string,
  unreadLetterIds: string[],
): string {
  return `${userId}:${[...unreadLetterIds].sort().join(",")}`;
}
