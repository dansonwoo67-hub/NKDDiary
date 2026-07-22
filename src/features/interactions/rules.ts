export const COMMENT_MAX_GRAPHEMES = 200;
export const ANNOTATION_TEXT_MAX_GRAPHEMES = 2_000;
export const JOURNAL_BODY_BLOCK_ID = "body";
export const CROSS_BLOCK_SELECTION_MESSAGE = "请在同一段文字中选择内容";

type InteractionEntry = {
  entryType: "today" | "future";
  openedAt: string | null;
};

export function canInteract(
  entry: InteractionEntry,
  role: "author" | "recipient",
) {
  const isParticipant = role === "author" || role === "recipient";
  return isParticipant && (entry.entryType === "today" || entry.openedAt !== null);
}

export function countGraphemes(value: string) {
  return Array.from(
    new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(value),
  ).length;
}

export function validateCommentBody(value: string):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, message: "评论不能为空。" };
  if (countGraphemes(trimmed) > COMMENT_MAX_GRAPHEMES) {
    return { ok: false, message: "评论不能超过 200 个字符。" };
  }
  return { ok: true, value: trimmed };
}

export function validateLongInteractionText(
  value: string,
  label: "评注" | "回复",
): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, message: `${label}不能为空。` };
  if (countGraphemes(trimmed) > ANNOTATION_TEXT_MAX_GRAPHEMES) {
    return { ok: false, message: `${label}不能超过 2000 个字符。` };
  }
  return { ok: true, value: trimmed };
}
