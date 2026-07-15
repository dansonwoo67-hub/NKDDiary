import { requireUser } from "@/lib/auth/require-user";
import { getChinaDateString } from "@/lib/date/china-day";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countCharacters } from "@/lib/validation/text-limits";
import type {
  DraftResumeMetadata,
  LetterWritingEntry,
  ResumableEditorState,
} from "@/features/letters/editor/entry-state";

export type { LetterWritingEntry } from "@/features/letters/editor/entry-state";

export type TodayLetterRow = {
  id: string;
  status: string;
  kind: string;
  version: number;
  letter_date: string;
  salutation: string | null;
  body_json: unknown;
  body_text: string | null;
  self_mood_value: number | null;
  meal_value: number | null;
  health_value: number | null;
  seven_char_line: string | null;
  scheduled_for: string | null;
  updated_at: string;
};

function entryPriority(row: TodayLetterRow): number {
  if (row.status === "published" || row.status === "withdrawn") return 2;
  if (row.status === "draft") return 1;
  return 0;
}

export function selectTodayEntryRow(
  rows: TodayLetterRow[],
): TodayLetterRow | null {
  const candidates = rows.filter((row) => row.kind === "daily");
  if (candidates.length === 0) return null;

  return candidates.reduce((selected, candidate) => {
    const priorityDifference =
      entryPriority(candidate) - entryPriority(selected);
    if (priorityDifference !== 0) {
      return priorityDifference > 0 ? candidate : selected;
    }

    const parsedCandidateTime = Date.parse(candidate.updated_at);
    const parsedSelectedTime = Date.parse(selected.updated_at);
    const candidateTime = Number.isFinite(parsedCandidateTime)
      ? parsedCandidateTime
      : Number.NEGATIVE_INFINITY;
    const selectedTime = Number.isFinite(parsedSelectedTime)
      ? parsedSelectedTime
      : Number.NEGATIVE_INFINITY;
    if (candidateTime !== selectedTime) {
      return candidateTime > selectedTime ? candidate : selected;
    }

    return candidate.id.localeCompare(selected.id) > 0 ? candidate : selected;
  });
}

function sliderValue(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5
    ? numeric
    : null;
}

function recordBodyJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { type: "doc", content: [] };
}

export function mapTodayWritingEntry(
  today: string,
  row: TodayLetterRow | null,
): LetterWritingEntry {
  if (!row) return { availability: "new", today, initialDraft: null };
  if (row.status === "published") {
    return {
      availability: "published",
      today,
      letterId: String(row.id),
      href: `/letters/${today}`,
    };
  }
  if (row.status === "withdrawn") {
    return { availability: "withdrawn", today, letterId: String(row.id) };
  }
  if (row.status !== "draft" || row.kind !== "daily") {
    return { availability: "unavailable", today, letterId: String(row.id) };
  }

  const mood = sliderValue(row.self_mood_value);
  const meal = sliderValue(row.meal_value);
  const health = sliderValue(row.health_value);
  const salutation = String(row.salutation ?? "");
  const metadata: DraftResumeMetadata = {
    id: String(row.id),
    version: Number(row.version),
    letterDate: today,
    kind: "daily",
    status: "draft",
    salutation,
    bodyJson: recordBodyJson(row.body_json),
    bodyText: String(row.body_text ?? ""),
    finalLine: String(row.seven_char_line ?? ""),
    scheduledFor: row.scheduled_for ? String(row.scheduled_for) : null,
    sliders: { mood, meal, health },
  };

  let state: ResumableEditorState;
  if (mood === null) {
    state = { step: "mood", kind: "daily", today };
  } else if (meal === null) {
    state = { step: "meal", kind: "daily", today, answers: { mood } };
  } else if (health === null) {
    state = {
      step: "health",
      kind: "daily",
      today,
      answers: { mood, meal },
    };
  } else {
    const answers = { mood, meal, health };
    const salutationLength = countCharacters(salutation);
    state =
      salutationLength >= 1 && salutationLength <= 7
        ? { step: "compose", kind: "daily", today, answers, salutation }
        : { step: "salutation", kind: "daily", today, answers, salutation };
  }

  return {
    availability: "draft",
    today,
    initialDraft: { state, metadata },
  };
}

export async function getTodayWritingEntry({
  userId,
  today = getChinaDateString(),
}: {
  userId: string;
  today?: string;
}): Promise<LetterWritingEntry> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("letters")
    .select(
      "id, status, kind, version, salutation, body_json, body_text, self_mood_value, meal_value, health_value, seven_char_line, scheduled_for, updated_at",
    )
    .eq("author_id", userId)
    .eq("letter_date", today)
    .eq("kind", "daily")
    .order("updated_at", { ascending: false })
    // This private two-person app expects at most a handful of lifecycle rows;
    // keep the defensive candidate scan bounded even if legacy duplicates exist.
    .limit(10);

  if (error) throw new Error(error.message);
  return mapTodayWritingEntry(
    today,
    selectTodayEntryRow((data ?? []) as TodayLetterRow[]),
  );
}

export async function getWritingEntryForLetterId({
  userId,
  id,
  today = getChinaDateString(),
}: {
  userId: string;
  id: string;
  today?: string;
}): Promise<LetterWritingEntry> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("letters")
    .select(
      "id, status, kind, version, letter_date, salutation, body_json, body_text, self_mood_value, meal_value, health_value, seven_char_line, scheduled_for, updated_at",
    )
    .eq("id", id)
    .eq("author_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { availability: "unavailable", today, letterId: id };

  const row = data as TodayLetterRow;
  if (row.status === "published") {
    return {
      availability: "published",
      today,
      letterId: String(row.id),
      href: `/letters/${row.letter_date}`,
    };
  }
  if (row.status === "withdrawn") {
    return { availability: "withdrawn", today, letterId: String(row.id) };
  }
  if (row.status !== "draft") {
    return { availability: "unavailable", today, letterId: String(row.id) };
  }
  if (row.kind === "daily") {
    return mapTodayWritingEntry(String(row.letter_date), row);
  }

  const salutation = String(row.salutation ?? "");
  const scheduledFor = row.scheduled_for ? String(row.scheduled_for) : null;
  const metadata: DraftResumeMetadata = {
    id: String(row.id),
    version: Number(row.version),
    letterDate: String(row.letter_date),
    kind: "time_capsule",
    status: "draft",
    salutation,
    bodyJson: recordBodyJson(row.body_json),
    bodyText: String(row.body_text ?? ""),
    finalLine: String(row.seven_char_line ?? ""),
    scheduledFor,
    sliders: null,
  };
  const state: ResumableEditorState = !scheduledFor
    ? { step: "schedule", kind: "time_capsule", today }
    : countCharacters(salutation) >= 1 && countCharacters(salutation) <= 7
      ? { step: "compose", kind: "time_capsule", today, scheduledFor, salutation }
      : { step: "salutation", kind: "time_capsule", today, scheduledFor, salutation };

  return {
    availability: "draft",
    today,
    initialDraft: { state, metadata },
  };
}

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

export type LetterAnnotation = {
  id: string;
  blockId: string | null;
  startOffset: number | null;
  endOffset: number | null;
  quotedText: string;
  comment: string;
  authorName: string;
  replies: Array<{ id: string; body: string; authorName: string }>;
};

export type ReaderLetter = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  letterDate: string;
  body: string;
  bodyJson: unknown;
  selfMoodValue: number;
  mealValue: number;
  healthValue: number;
  sevenCharLine: string;
  hasOpened: boolean;
  openResponseText: string | null;
  annotations: LetterAnnotation[];
  isBookmarked: boolean;
};

export type LetterDayView = { date: string; currentUserId: string; letters: ReaderLetter[] };

export async function getTodayLetterForEditor(): Promise<EditorLetterState> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const today = getChinaDateString();
  const { data, error } = await supabase
    .from("letters")
    .select("id, body, body_text, self_mood_value, meal_value, health_value, seven_char_line, editable_until, status")
    .eq("author_id", userId)
    .eq("letter_date", today)
    .eq("kind", "daily")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { today, letter: null, canEdit: true, lockedMessage: null };

  const canEdit = String(data.status) === "draft";
  return {
    today,
    canEdit,
    lockedMessage: canEdit ? null : "这封信已经封存，不能再编辑。",
    letter: {
      id: String(data.id),
      body: String(data.body_text ?? data.body ?? ""),
      selfMoodValue: Number(data.self_mood_value ?? 3),
      mealValue: Number(data.meal_value ?? 3),
      healthValue: Number(data.health_value ?? 3),
      sevenCharLine: String(data.seven_char_line ?? ""),
      editableUntil: String(data.editable_until ?? ""),
    },
  };
}

export async function getLettersForDate(date: string): Promise<LetterDayView> {
  const { userId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("letters")
    .select(
      "id, author_id, letter_date, body, body_json, body_text, self_mood_value, meal_value, health_value, seven_char_line, profiles:author_id(display_name, avatar_url), letter_open_responses(reader_id, response_text), annotations(id, block_id, start_offset, end_offset, quoted_text, comment, profiles:author_id(display_name), annotation_replies(id, body, profiles:author_id(display_name)))",
    )
    .eq("letter_date", date)
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  const letterIds = (data ?? []).map((letter) => String(letter.id));
  let bookmarkedLetterIds = new Set<string>();
  if (letterIds.length > 0) {
    const { data: bookmarks, error: bookmarkError } = await supabase
      .from("bookmarks")
      .select("letter_id, kind")
      .eq("owner_id", userId)
      .eq("kind", "letter")
      .in("letter_id", letterIds);
    if (bookmarkError) throw new Error(bookmarkError.message);
    bookmarkedLetterIds = new Set((bookmarks ?? []).map((bookmark) => String(bookmark.letter_id)));
  }
  const letters: ReaderLetter[] = (data ?? []).map((letter) => {
    const profile = Array.isArray(letter.profiles) ? letter.profiles[0] : letter.profiles;
    const responses = Array.isArray(letter.letter_open_responses) ? letter.letter_open_responses : [];
    const annotations = Array.isArray(letter.annotations) ? letter.annotations : [];
    const ownLetter = String(letter.author_id) === userId;
    const response = responses.find((item) => String(item.reader_id) === userId);
    const mappedAnnotations = annotations.map((annotation) => {
      const annotationProfile = Array.isArray(annotation.profiles) ? annotation.profiles[0] : annotation.profiles;
      const replies = Array.isArray(annotation.annotation_replies) ? annotation.annotation_replies : [];
      return {
        id: String(annotation.id),
        blockId: annotation.block_id === null ? null : String(annotation.block_id),
        startOffset: annotation.start_offset === null ? null : Number(annotation.start_offset),
        endOffset: annotation.end_offset === null ? null : Number(annotation.end_offset),
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
    }).sort((a, b) =>
      (a.startOffset ?? Number.MAX_SAFE_INTEGER) - (b.startOffset ?? Number.MAX_SAFE_INTEGER) ||
      (b.endOffset ?? -1) - (a.endOffset ?? -1) || a.id.localeCompare(b.id)
    );

    return {
      id: String(letter.id),
      authorId: String(letter.author_id),
      authorName: String(profile?.display_name ?? "对方"),
      authorAvatarUrl: profile?.avatar_url ? String(profile.avatar_url) : null,
      letterDate: String(letter.letter_date),
      body: String(letter.body_text ?? letter.body ?? ""),
      bodyJson: letter.body_json,
      selfMoodValue: Number(letter.self_mood_value ?? 3),
      mealValue: Number(letter.meal_value ?? 3),
      healthValue: Number(letter.health_value ?? 3),
      sevenCharLine: String(letter.seven_char_line ?? ""),
      hasOpened: ownLetter || Boolean(response),
      openResponseText: response?.response_text ? String(response.response_text) : null,
      annotations: mappedAnnotations,
      isBookmarked: bookmarkedLetterIds.has(String(letter.id)),
    };
  });

  return { date, currentUserId: userId, letters };
}
