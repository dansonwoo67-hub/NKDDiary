import { describe, expect, it, vi } from "vitest";
import { createBookmarkGateway } from "./supabase-gateway";

describe("bookmark Supabase gateway", () => {
  it("forces current-user ownership for lookups, inserts, and deletes", async () => {
    const query = {
      select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(),
      insert: vi.fn(), delete: vi.fn(),
    };
    for (const method of ["select", "eq", "is", "delete"] as const) query[method].mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    query.insert.mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => query) };
    const gateway = createBookmarkGateway(client as never, "viewer-id");

    await gateway.findBookmark({ ownerId: "forged-owner", letterId: "letter-id", kind: "letter" });
    await gateway.insertBookmark({
      ownerId: "forged-owner", letterId: "letter-id", kind: "letter",
      blockId: null, startOffset: null, endOffset: null, quotedText: null,
    });
    await gateway.deleteBookmark({ ownerId: "forged-owner", bookmarkId: "bookmark-id" });

    expect(query.eq).toHaveBeenCalledWith("owner_id", "viewer-id");
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ owner_id: "viewer-id" }));
    expect(query.delete).toHaveBeenCalledOnce();
  });

  it("only resolves published letters through the viewer session", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const gateway = createBookmarkGateway({ from: vi.fn(() => query) } as never, "viewer-id");
    await gateway.getReadablePublishedLetter("letter-id");
    expect(query.eq).toHaveBeenCalledWith("id", "letter-id");
    expect(query.eq).toHaveBeenCalledWith("status", "published");
  });
});
