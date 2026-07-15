import { anchorMatchesPublishedLetter } from "@/features/annotations/create-annotation-core";
import { BLOCK_ID_PATTERN, MAX_QUOTED_TEXT_LENGTH } from "@/features/annotations/selection-anchor";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ExcerptBookmarkInput = {
  letterId: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  quotedText: string;
};

export type BookmarkRow = {
  id: string;
  ownerId: string;
  letterId: string;
  kind: "letter" | "excerpt";
  blockId: string | null;
  startOffset: number | null;
  endOffset: number | null;
  quotedText: string | null;
};

type BookmarkIdentity = Pick<BookmarkRow, "ownerId" | "letterId" | "kind"> &
  Partial<Pick<BookmarkRow, "blockId" | "startOffset" | "endOffset">>;

export type BookmarkGateway = {
  getReadablePublishedLetter(letterId: string): Promise<{
    id: string;
    bodyJson: unknown;
    bodyText: string | null;
  } | null>;
  findBookmark(identity: BookmarkIdentity): Promise<BookmarkRow | null>;
  insertBookmark(input: Omit<BookmarkRow, "id">): Promise<
    { ok: true } | { ok: false; code?: string; message: string }
  >;
  deleteBookmark(input: { ownerId: string; bookmarkId: string }): Promise<
    { ok: true } | { ok: false; message: string }
  >;
};

function validLetterId(letterId: string) {
  return typeof letterId === "string" && UUID_PATTERN.test(letterId);
}

function validExcerpt(input: ExcerptBookmarkInput) {
  return input !== null && typeof input === "object" &&
    validLetterId(input.letterId) &&
    BLOCK_ID_PATTERN.test(input.blockId) &&
    Number.isInteger(input.startOffset) &&
    Number.isInteger(input.endOffset) &&
    input.startOffset >= 0 && input.endOffset > input.startOffset &&
    typeof input.quotedText === "string" && input.quotedText.trim().length > 0 &&
    input.quotedText.length <= MAX_QUOTED_TEXT_LENGTH &&
    input.endOffset - input.startOffset === input.quotedText.length;
}

export async function createExcerptBookmark(
  input: ExcerptBookmarkInput,
  context: { userId: string; gateway: BookmarkGateway },
) {
  if (!validExcerpt(input)) return { ok: false as const, message: "收藏的文字位置无效。" };
  const letter = await context.gateway.getReadablePublishedLetter(input.letterId);
  if (!letter) return { ok: false as const, message: "没有找到可收藏的已发布信件。" };
  if (!anchorMatchesPublishedLetter(letter, input)) {
    return { ok: false as const, message: "选中文字与已发布正文不一致。" };
  }

  const identity: BookmarkIdentity = {
    ownerId: context.userId,
    letterId: input.letterId,
    kind: "excerpt",
    blockId: input.blockId,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
  };
  if (await context.gateway.findBookmark(identity)) {
    return { ok: true as const, bookmarked: true as const, message: "已收藏" };
  }
  const inserted = await context.gateway.insertBookmark({
    ...identity,
    blockId: input.blockId,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    quotedText: input.quotedText,
  });
  if (!inserted.ok && inserted.code !== "23505") return inserted;
  return { ok: true as const, bookmarked: true as const, message: "已收藏" };
}

export async function toggleWholeLetterBookmark(
  input: { letterId: string },
  context: { userId: string; gateway: BookmarkGateway },
) {
  if (input === null || typeof input !== "object" || !validLetterId(input.letterId)) {
    return { ok: false as const, message: "信件编号无效。" };
  }
  const letter = await context.gateway.getReadablePublishedLetter(input.letterId);
  if (!letter) return { ok: false as const, message: "没有找到可收藏的已发布信件。" };
  const identity: BookmarkIdentity = { ownerId: context.userId, letterId: input.letterId, kind: "letter" };
  const existing = await context.gateway.findBookmark(identity);
  if (existing) {
    const removed = await context.gateway.deleteBookmark({ ownerId: context.userId, bookmarkId: existing.id });
    if (!removed.ok) return removed;
    return { ok: true as const, bookmarked: false as const, message: "已取消收藏" };
  }
  const inserted = await context.gateway.insertBookmark({
    ownerId: context.userId,
    letterId: input.letterId,
    kind: "letter",
    blockId: null,
    startOffset: null,
    endOffset: null,
    quotedText: null,
  });
  if (!inserted.ok && inserted.code !== "23505") return inserted;
  return { ok: true as const, bookmarked: true as const, message: "已收藏" };
}

export async function removeBookmark(
  input: { bookmarkId: string },
  context: { userId: string; gateway: BookmarkGateway },
) {
  if (input === null || typeof input !== "object" ||
    typeof input.bookmarkId !== "string" || input.bookmarkId.length === 0 || input.bookmarkId.length > 128) {
    return { ok: false as const, message: "收藏编号无效。" };
  }
  const result = await context.gateway.deleteBookmark({ ownerId: context.userId, bookmarkId: input.bookmarkId });
  return result.ok ? { ok: true as const, message: "已取消收藏" } : result;
}
