import { describe, expect, it } from "vitest";
import {
  createExcerptBookmark,
  removeBookmark,
  toggleWholeLetterBookmark,
  type BookmarkGateway,
} from "./core";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LETTER_ID = "22222222-2222-4222-8222-222222222222";
const excerpt = {
  letterId: LETTER_ID,
  blockId: "p-1",
  startOffset: 2,
  endOffset: 6,
  quotedText: "准备出发",
};

function makeGateway(options: { published?: boolean; body?: string } = {}) {
  const rows: Array<{
    id: string;
    ownerId: string;
    letterId: string;
    kind: "letter" | "excerpt";
    blockId: string | null;
    startOffset: number | null;
    endOffset: number | null;
    quotedText: string | null;
  }> = [];
  let sequence = 0;
  const gateway: BookmarkGateway = {
    async getReadablePublishedLetter(letterId) {
      if (options.published === false || letterId !== LETTER_ID) return null;
      return {
        id: LETTER_ID,
        bodyJson: {
          type: "doc",
          content: [{
            type: "paragraph",
            attrs: { blockId: "p-1" },
            content: [{ type: "text", text: options.body ?? "今天准备出发" }],
          }],
        },
        bodyText: options.body ?? "今天准备出发",
      };
    },
    async findBookmark(query) {
      return rows.find((row) =>
        row.ownerId === query.ownerId &&
        row.letterId === query.letterId &&
        row.kind === query.kind &&
        row.blockId === (query.blockId ?? null) &&
        row.startOffset === (query.startOffset ?? null) &&
        row.endOffset === (query.endOffset ?? null)
      ) ?? null;
    },
    async insertBookmark(input) {
      const duplicate = rows.some((row) =>
        row.ownerId === input.ownerId && row.letterId === input.letterId &&
        row.kind === input.kind && row.blockId === input.blockId &&
        row.startOffset === input.startOffset && row.endOffset === input.endOffset
      );
      if (duplicate) return { ok: false, code: "23505", message: "duplicate" };
      rows.push({ id: `bookmark-${++sequence}`, ...input });
      return { ok: true };
    },
    async deleteBookmark(query) {
      const index = rows.findIndex((row) => row.id === query.bookmarkId && row.ownerId === query.ownerId);
      if (index >= 0) rows.splice(index, 1);
      return { ok: true };
    },
  };
  return { gateway, rows };
}

describe("bookmark core", () => {
  it("does not duplicate the same excerpt bookmark, including a unique race", async () => {
    const { gateway, rows } = makeGateway();
    expect((await createExcerptBookmark(excerpt, { userId: USER_ID, gateway })).ok).toBe(true);
    expect((await createExcerptBookmark(excerpt, { userId: USER_ID, gateway })).ok).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("rejects a forged or moved excerpt and an unreadable letter", async () => {
    const moved = makeGateway({ body: "今天改了行程" });
    expect(await createExcerptBookmark(excerpt, { userId: USER_ID, gateway: moved.gateway }))
      .toMatchObject({ ok: false });
    expect(moved.rows).toHaveLength(0);

    const hidden = makeGateway({ published: false });
    expect(await createExcerptBookmark(excerpt, { userId: USER_ID, gateway: hidden.gateway }))
      .toMatchObject({ ok: false });
  });

  it("keeps rapid whole-letter toggles idempotent under create races", async () => {
    const { gateway, rows } = makeGateway();
    const [first, second] = await Promise.all([
      toggleWholeLetterBookmark({ letterId: LETTER_ID }, { userId: USER_ID, gateway }),
      toggleWholeLetterBookmark({ letterId: LETTER_ID }, { userId: USER_ID, gateway }),
    ]);
    expect(first).toMatchObject({ ok: true, bookmarked: true });
    expect(second).toMatchObject({ ok: true, bookmarked: true });
    expect(rows).toHaveLength(1);
  });

  it("removes only a bookmark owned by the authenticated viewer", async () => {
    const { gateway, rows } = makeGateway();
    await createExcerptBookmark(excerpt, { userId: USER_ID, gateway });
    const id = rows[0].id;
    expect(await removeBookmark({ bookmarkId: id }, { userId: "33333333-3333-4333-8333-333333333333", gateway }))
      .toMatchObject({ ok: true });
    expect(rows).toHaveLength(1);
    expect(await removeBookmark({ bookmarkId: id }, { userId: USER_ID, gateway })).toMatchObject({ ok: true });
    expect(rows).toHaveLength(0);
  });

  it("rejects malformed runtime payloads without throwing", async () => {
    const { gateway } = makeGateway();

    await expect(createExcerptBookmark(null as never, { userId: USER_ID, gateway }))
      .resolves.toMatchObject({ ok: false });
    await expect(toggleWholeLetterBookmark(undefined as never, { userId: USER_ID, gateway }))
      .resolves.toMatchObject({ ok: false });
    await expect(removeBookmark({ bookmarkId: "" }, { userId: USER_ID, gateway }))
      .resolves.toMatchObject({ ok: false });
  });
});
