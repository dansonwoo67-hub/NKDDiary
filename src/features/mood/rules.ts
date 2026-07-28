const MOOD_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function countGraphemes(value: string) {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(value)].length;
  }
  return [...value].length;
}

export function validateMoodInput(value: string) {
  const content = value.trim();
  if (!content || countGraphemes(content) > 15) return null;
  return { content };
}

export function canAuthorMutate(createdAt: string, now = new Date()) {
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  const elapsed = now.getTime() - createdAtMs;
  return elapsed >= 0 && elapsed < MOOD_EDIT_WINDOW_MS;
}
