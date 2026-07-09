import { requireCharacterRange } from "@/lib/validation/text-limits";

export function validateSevenCharLine(value: string) {
  return requireCharacterRange(value, 1, 7, "今日七字信");
}

export function validateOpenResponse(value: string) {
  return requireCharacterRange(value, 1, 3, "三字回应");
}

export function calculateEditableUntil(submittedAt: Date) {
  return new Date(submittedAt.getTime() + 24 * 60 * 60 * 1000);
}

export function canEditLetter(now: Date, editableUntil: Date) {
  return now.getTime() <= editableUntil.getTime();
}
