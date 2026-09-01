import type { JournalEntry } from "./repository";

export function createJournalEntryFixture(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "entry-1",
    spaceId: "space-1",
    authorId: "author-1",
    recipientId: null,
    entryType: "today",
    title: "",
    content: "Test letter content",
    richHtml: null,
    plainText: "Test letter content",
    excerpt: "Test letter content",
    stationeryTheme: "cream",
    moodEmoji: null,
    withdrawnAt: null,
    deletedAt: null,
    purgeAt: null,
    starAt: null,
    imagePath: null,
    entryDate: "2026-07-19",
    publishedAt: "2026-07-19T10:00:00Z",
    updatedAt: "2026-07-19T10:00:00Z",
    lockedAt: "2026-07-20T10:00:00Z",
    sealedAt: null,
    openAt: null,
    openedAt: null,
    ...overrides,
  };
}
