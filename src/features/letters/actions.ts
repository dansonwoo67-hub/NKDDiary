"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getChinaDateString } from "@/lib/date/china-day";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { canEditLetter, validateSevenCharLine } from "@/features/letters/rules";

export type SaveLetterInput = {
  body: string;
  selfMoodValue: number;
  mealValue: number;
  healthValue: number;
  sevenCharLine: string;
  latitude?: number;
  longitude?: number;
  locationRecordedAt?: string;
};

export type EditorLetter = {
  id: string;
  body: string;
  selfMoodValue: number;
  mealValue: number;
  healthValue: number;
  sevenCharLine: string;
  editableUntil: string;
};

export type EditorLetterState = {
  today: string;
  letter: EditorLetter | null;
  canEdit: boolean;
  lockedMessage: string | null;
};

function normalizeSliderValue(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("三问滑块只能选择 1 到 5。");
  }

  return value;
}

export async function getTodayLetterForEditor(): Promise<EditorLetterState> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const today = getChinaDateString();

  const { data, error } = await supabase
    .from("letters")
    .select("id, body, self_mood_value, meal_value, health_value, seven_char_line, editable_until")
    .eq("author_id", userId)
    .eq("letter_date", today)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return { today, letter: null, canEdit: true, lockedMessage: null };
  }

  const editableUntil = String(data.editable_until);
  const canEdit = canEditLetter(new Date(), new Date(editableUntil));

  return {
    today,
    canEdit,
    lockedMessage: canEdit ? null : "这封信已经封存啦，不能再编辑。",
    letter: {
      id: String(data.id),
      body: String(data.body),
      selfMoodValue: Number(data.self_mood_value),
      mealValue: Number(data.meal_value),
      healthValue: Number(data.health_value),
      sevenCharLine: String(data.seven_char_line),
      editableUntil,
    },
  };
}

export async function saveLetterAction(input: SaveLetterInput): Promise<ActionResult> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const today = getChinaDateString();
  const body = input.body.trim();

  if (!body) {
    return { ok: false, message: "正文不能为空。" };
  }

  let sevenCharLine: string;
  let selfMoodValue: number;
  let mealValue: number;
  let healthValue: number;

  try {
    sevenCharLine = validateSevenCharLine(input.sevenCharLine);
    selfMoodValue = normalizeSliderValue(input.selfMoodValue);
    mealValue = normalizeSliderValue(input.mealValue);
    healthValue = normalizeSliderValue(input.healthValue);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "保存失败。" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("letters")
    .select("id, editable_until")
    .eq("author_id", userId)
    .eq("letter_date", today)
    .maybeSingle();

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  if (existing && !canEditLetter(new Date(), new Date(String(existing.editable_until)))) {
    return { ok: false, message: "这封信已经封存啦，不能再编辑。" };
  }

  const payload: {
    author_id: string;
    letter_date: string;
    body: string;
    self_mood_value: number;
    meal_value: number;
    health_value: number;
    seven_char_line: string;
    latitude?: number;
    longitude?: number;
    location_recorded_at?: string;
  } = {
    author_id: userId,
    letter_date: today,
    body,
    self_mood_value: selfMoodValue,
    meal_value: mealValue,
    health_value: healthValue,
    seven_char_line: sevenCharLine,
  };

  if (input.latitude !== undefined && input.longitude !== undefined) {
    payload.latitude = input.latitude;
    payload.longitude = input.longitude;
    payload.location_recorded_at = input.locationRecordedAt ?? new Date().toISOString();
  }

  const { error } = existing
    ? await supabase.from("letters").update(payload).eq("id", String(existing.id))
    : await supabase.from("letters").insert(payload);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/write");

  return { ok: true, message: "今天的信保存好啦。" };
}
