"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getChinaDateString } from "@/lib/date/china-day";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/profile/actions";
import { canEditLetter, validateOpenResponse, validateSevenCharLine } from "@/features/letters/rules";

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

export type ReaderLetter = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  letterDate: string;
  body: string;
  selfMoodValue: number;
  mealValue: number;
  healthValue: number;
  sevenCharLine: string;
  hasOpened: boolean;
  openResponseText: string | null;
  annotations: LetterAnnotation[];
};

export type LetterDayView = {
  date: string;
  currentUserId: string;
  letters: ReaderLetter[];
};

export type LetterAnnotation = {
  id: string;
  quotedText: string;
  comment: string;
  authorName: string;
  replies: Array<{
    id: string;
    body: string;
    authorName: string;
  }>;
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

export async function createOpenResponseAction(input: { letterId: string; responseText: string }): Promise<ActionResult> {
  const { userId, profile } = await requireUser();
  const supabase = await createServerSupabaseClient();

  let responseText: string;
  try {
    responseText = validateOpenResponse(input.responseText);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "回应不符合要求。" };
  }

  const { data: letter, error: letterError } = await supabase
    .from("letters")
    .select("id, author_id")
    .eq("id", input.letterId)
    .single();

  if (letterError || !letter) {
    return { ok: false, message: letterError?.message ?? "没有找到这封信。" };
  }

  if (String(letter.author_id) === userId) {
    return { ok: true, message: "自己的信可以直接展开。" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("letter_open_responses")
    .select("id")
    .eq("letter_id", input.letterId)
    .eq("reader_id", userId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  if (!existing) {
    const { error } = await supabase.from("letter_open_responses").insert({
      letter_id: input.letterId,
      reader_id: userId,
      response_text: responseText,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    await supabase.from("notifications").insert({
      recipient_id: String(letter.author_id),
      type: "letter_opened",
      source_id: input.letterId,
      title: `${profile.display_name} 展开了你的信`,
      body: `回应：${responseText}`,
    });
  }

  revalidatePath("/");
  return { ok: true, message: "展信啦。" };
}

export async function getLettersForDate(date: string): Promise<LetterDayView> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("letters")
    .select(
      "id, author_id, letter_date, body, self_mood_value, meal_value, health_value, seven_char_line, profiles:author_id(display_name, avatar_url), letter_open_responses(reader_id, response_text), annotations(id, quoted_text, comment, profiles:author_id(display_name), letter_annotation_replies(id, body, profiles:author_id(display_name)))",
    )
    .eq("letter_date", date)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const letters: ReaderLetter[] = (data ?? []).map((letter) => {
    const profile = Array.isArray(letter.profiles) ? letter.profiles[0] : letter.profiles;
    const responses = Array.isArray(letter.letter_open_responses) ? letter.letter_open_responses : [];
    const annotations = Array.isArray(letter.annotations) ? letter.annotations : [];
    const ownLetter = String(letter.author_id) === userId;
    const response = responses.find((item) => String(item.reader_id) === userId);

    return {
      id: String(letter.id),
      authorId: String(letter.author_id),
      authorName: String(profile?.display_name ?? "对方"),
      authorAvatarUrl: profile?.avatar_url ? String(profile.avatar_url) : null,
      letterDate: String(letter.letter_date),
      body: String(letter.body),
      selfMoodValue: Number(letter.self_mood_value),
      mealValue: Number(letter.meal_value),
      healthValue: Number(letter.health_value),
      sevenCharLine: String(letter.seven_char_line),
      hasOpened: ownLetter || Boolean(response),
      openResponseText: response?.response_text ? String(response.response_text) : null,
      annotations: annotations.map((annotation) => {
        const annotationProfile = Array.isArray(annotation.profiles) ? annotation.profiles[0] : annotation.profiles;
        const replies = Array.isArray(annotation.letter_annotation_replies) ? annotation.letter_annotation_replies : [];

        return {
          id: String(annotation.id),
          quotedText: String(annotation.quoted_text),
          comment: String(annotation.comment),
          authorName: String(annotationProfile?.display_name ?? "对方"),
          replies: replies.map((reply) => {
            const replyProfile = Array.isArray(reply.profiles) ? reply.profiles[0] : reply.profiles;

            return {
              id: String(reply.id),
              body: String(reply.body),
              authorName: String(replyProfile?.display_name ?? "对方"),
            };
          }),
        };
      }),
    };
  });

  return { date, currentUserId: userId, letters };
}
