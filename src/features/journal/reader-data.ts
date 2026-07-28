import type { JournalEntry } from "./repository";

export type JournalReaderEntry = Pick<
  JournalEntry,
  "id" | "authorId" | "entryType" | "title" | "content" | "entryDate" | "publishedAt" | "updatedAt" | "lockedAt"
>;

export function toJournalReaderEntry(entry: JournalEntry): JournalReaderEntry {
  return {
    id: entry.id,
    authorId: entry.authorId,
    entryType: entry.entryType,
    title: entry.title,
    content: entry.content,
    entryDate: entry.entryDate,
    publishedAt: entry.publishedAt,
    updatedAt: entry.updatedAt,
    lockedAt: entry.lockedAt,
  };
}
