import { describe, expect, it } from "vitest";
import { toJournalReaderEntry } from "./reader-data";

describe("toJournalReaderEntry", () => {
  it("strips a private image path before journal data crosses the client boundary", () => {
    const privateImagePath = "space-1/author-1/private-photo.webp";
    const readerEntry = toJournalReaderEntry({
      id: "entry-1",
      spaceId: "space-1",
      authorId: "author-1",
      recipientId: null,
      entryType: "today",
      title: "普通的一天",
      content: "今天一起散步。",
      imagePath: privateImagePath,
      entryDate: "2026-07-19",
      publishedAt: "2026-07-19T10:00:00Z",
      updatedAt: "2026-07-19T11:00:00Z",
      lockedAt: "2026-07-20T10:00:00Z",
      sealedAt: null,
      openAt: null,
      openedAt: null,
    });

    expect(readerEntry).not.toHaveProperty("imagePath");
    expect(JSON.stringify(readerEntry)).not.toContain(privateImagePath);
  });
});
