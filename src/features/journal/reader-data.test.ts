import { describe, expect, it } from "vitest";
import { toJournalReaderEntry } from "./reader-data";
import { createJournalEntryFixture } from "./test-fixtures";

describe("toJournalReaderEntry", () => {
  it("strips a private image path before journal data crosses the client boundary", () => {
    const privateImagePath = "space-1/author-1/private-photo.webp";
    const readerEntry = toJournalReaderEntry(createJournalEntryFixture({
      title: "普通的一天",
      content: "今天一起散步。",
      imagePath: privateImagePath,
      updatedAt: "2026-07-19T11:00:00Z",
    }));

    expect(readerEntry).not.toHaveProperty("imagePath");
    expect(JSON.stringify(readerEntry)).not.toContain(privateImagePath);
  });
});
