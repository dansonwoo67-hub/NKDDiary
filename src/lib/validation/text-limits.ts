export function countCharacters(value: string) {
  return Array.from(value.trim()).length;
}

export function requireCharacterRange(value: string, min: number, max: number, label: string) {
  const count = countCharacters(value);

  if (count < min) {
    throw new Error(`${label}不能为空`);
  }

  if (count > max) {
    throw new Error(`${label}最多${max}个字`);
  }

  return value.trim();
}
