import { describe, expect, it, vi } from "vitest";
import {
  FULL_ENTRY_FIELDS,
  FUTURE_CARD_FIELDS,
  getJournalEntry,
  listTodayDiaryEntries,
  listFutureDiaryCards,
} from "./repository";

describe("journal repository", () => {
  it("does not select protected fields for an unopened recipient card", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "entry-1",
          author_id: "author",
          recipient_id: "recipient",
          sealed_at: "2026-07-19T10:00:00Z",
          open_at: "2026-08-01T12:00:00Z",
          opened_at: null,
          created_at: "2026-07-19T10:00:00Z",
        },
      ],
      error: null,
    });
    const from = vi.fn(() => {
      throw new Error("future cards must not query journal_entries directly");
    });

    const cards = await listFutureDiaryCards({ rpc, from } as never, {
      userId: "recipient",
      box: "received",
      now: new Date("2026-07-20T00:00:00Z"),
    });

    expect(rpc).toHaveBeenCalledWith("list_future_diary_cards", { p_box: "received" });
    expect(from).not.toHaveBeenCalled();
    expect(cards[0]).toEqual(expect.objectContaining({ authorId: "author", state: "waiting" }));
    expect(cards[0]).not.toHaveProperty("title");
    expect(cards[0]).not.toHaveProperty("content");
    expect(cards[0]).not.toHaveProperty("imagePath");
  });

  it("keeps the metadata and full-entry projections explicitly separated", () => {
    expect(FUTURE_CARD_FIELDS).toBe(
      "id, author_id, recipient_id, sealed_at, open_at, opened_at, created_at",
    );
    expect(FUTURE_CARD_FIELDS).not.toMatch(/title|content|image_path/);
    expect(FULL_ENTRY_FIELDS).toBe(
      "id, space_id, author_id, recipient_id, entry_type, title, content, image_path, entry_date, published_at, updated_at, locked_at, sealed_at, open_at, opened_at",
    );
  });

  it("returns not found when RLS hides a full journal row", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    await expect(getJournalEntry({ from } as never, "protected-id")).resolves.toBeNull();
    expect(from).toHaveBeenCalledWith("journal_entries");
    expect(select).toHaveBeenCalledWith(FULL_ENTRY_FIELDS);
    expect(eq).toHaveBeenCalledWith("id", "protected-id");
  });

  it("lists visible today diaries through the shared full-entry projection", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    await expect(listTodayDiaryEntries({ from } as never)).resolves.toEqual([]);
    expect(from).toHaveBeenCalledWith("journal_entries");
    expect(select).toHaveBeenCalledWith(FULL_ENTRY_FIELDS);
    expect(eq).toHaveBeenCalledWith("entry_type", "today");
    expect(order).toHaveBeenCalledWith("published_at", { ascending: false });
  });

  it("maps a visible full journal row without creating a signed image URL", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "entry-1",
        space_id: "space-1",
        author_id: "author",
        recipient_id: null,
        entry_type: "today",
        title: "A day",
        content: "A walk",
        image_path: "author/photo.webp",
        entry_date: "2026-07-19",
        published_at: "2026-07-19T10:00:00Z",
        updated_at: "2026-07-19T11:00:00Z",
        locked_at: "2026-07-20T10:00:00Z",
        sealed_at: null,
        open_at: null,
        opened_at: null,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    await expect(getJournalEntry({ from } as never, "entry-1")).resolves.toEqual(
      expect.objectContaining({
        id: "entry-1",
        authorId: "author",
        imagePath: "author/photo.webp",
        updatedAt: "2026-07-19T11:00:00Z",
      }),
    );
  });
});
