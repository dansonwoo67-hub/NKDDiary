export function validateSpaceName(value: string) {
  const name = value.trim();
  return name.length >= 1 && name.length <= 40 ? name : null;
}
