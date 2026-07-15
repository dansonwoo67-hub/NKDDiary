import { BLOCK_ID_PATTERN, MAX_QUOTED_TEXT_LENGTH } from "./selection-anchor";
import { parseRichLetterDocument } from "@/features/letters/rich-text-schema";

export type CreateAnnotationInput = {
  letterId: string;
  blockId: string;
  quotedText: string;
  startOffset: number;
  endOffset: number;
  comment: string;
};

type ValidationResult =
  | { ok: true; value: CreateAnnotationInput }
  | { ok: false; message: string };

export type PublishedLetter = {
  id: string;
  authorId: string;
  letterDate: string;
  bodyJson: unknown;
  bodyText: string | null;
};

export type AnnotationGateway = {
  getPublishedLetter(letterId: string): Promise<PublishedLetter | null>;
  insertAnnotation(input: CreateAnnotationInput & { authorId: string }): Promise<{ ok: true } | { ok: false; message: string }>;
  createNotification(input: {
    recipientId: string;
    letterId: string;
    title: string;
    body: string;
  }): Promise<{ ok: true } | { ok: false; message: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OFFSET = 1_000_000;
const MAX_DOCUMENT_TEXT = 100_000;

export function anchorMatchesPublishedLetter(
  letter: Pick<PublishedLetter, "bodyJson" | "bodyText">,
  anchor: Pick<CreateAnnotationInput, "blockId" | "startOffset" | "endOffset" | "quotedText">,
): boolean {
  const inspected = parseRichLetterDocument(letter.bodyJson);
  if (!inspected.ok) return false;

  let blockText: string | undefined;
  if (!inspected.hasStableBlockIds) {
    if (
      anchor.blockId !== "legacy-body" ||
      typeof letter.bodyText !== "string" ||
      letter.bodyText.length > MAX_DOCUMENT_TEXT
    ) {
      return false;
    }
    blockText = letter.bodyText;
  } else {
    if (anchor.blockId === "legacy-body") return false;
    blockText = inspected.blockText.get(anchor.blockId);
  }

  return (
    blockText !== undefined &&
    anchor.endOffset <= blockText.length &&
    blockText.slice(anchor.startOffset, anchor.endOffset) === anchor.quotedText
  );
}

export function validateCreateAnnotationInput(input: CreateAnnotationInput): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, message: "评点内容无效。" };
  if (!UUID_PATTERN.test(input.letterId)) return { ok: false, message: "信件编号无效。" };
  if (!BLOCK_ID_PATTERN.test(input.blockId)) return { ok: false, message: "文字位置无效。" };
  if (
    !Number.isInteger(input.startOffset) ||
    !Number.isInteger(input.endOffset) ||
    input.startOffset < 0 ||
    input.startOffset >= input.endOffset ||
    input.endOffset > MAX_OFFSET
  ) {
    return { ok: false, message: "文字位置无效。" };
  }
  if (
    typeof input.quotedText !== "string" ||
    !input.quotedText.trim() ||
    input.quotedText.length > MAX_QUOTED_TEXT_LENGTH ||
    input.endOffset - input.startOffset !== input.quotedText.length
  ) {
    return { ok: false, message: "选中文字与位置不一致。" };
  }

  if (typeof input.comment !== "string") return { ok: false, message: "评点需要 1 到 1000 个字。" };
  const comment = input.comment.trim();
  if (!comment || comment.length > 1_000) return { ok: false, message: "评点需要 1 到 1000 个字。" };
  return { ok: true, value: { ...input, comment } };
}

export async function createAnnotation(
  input: CreateAnnotationInput,
  context: { userId: string; displayName: string; gateway: AnnotationGateway },
) {
  const validated = validateCreateAnnotationInput(input);
  if (!validated.ok) return validated;

  const letter = await context.gateway.getPublishedLetter(validated.value.letterId);
  if (!letter) return { ok: false as const, message: "没有找到可评点的已发布信件。" };
  if (!anchorMatchesPublishedLetter(letter, validated.value)) {
    return { ok: false as const, message: "选中文字与已发布正文不一致。" };
  }

  const inserted = await context.gateway.insertAnnotation({
    ...validated.value,
    authorId: context.userId,
  });
  if (!inserted.ok) return inserted;

  if (letter.authorId !== context.userId) {
    await context.gateway.createNotification({
      recipientId: letter.authorId,
      letterId: letter.id,
      title: `${context.displayName} 评点了你的信`,
      body: validated.value.quotedText.slice(0, 60),
    });
  }

  return { ok: true as const, message: "评点已留下。", letterDate: letter.letterDate };
}
