export function validateMoodInput(input: { text: string; emoji: string }) {
  const text = input.text.trim();
  const emoji = input.emoji.trim();
  if ((!text && !emoji) || [...text].length > 140 || [...emoji].length > 8) return null;
  return { text, emoji };
}
