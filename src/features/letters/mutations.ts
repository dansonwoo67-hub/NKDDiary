import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/features/profile/actions";
import { countCharacters } from "@/lib/validation/text-limits";
import { canWithdrawLetter, validateSchedule, type LetterKind, type LetterStatus } from "./lifecycle";

export type LetterRecord = {
  id: string;
  authorId: string;
  status: LetterStatus;
  kind: LetterKind;
  version: number;
  publishedAt: string | null;
  letterDate: string;
  salutation: string | null;
  bodyJson: Record<string, unknown> | null;
  bodyText: string | null;
  sevenCharLine: string | null;
  scheduledFor: string | null;
  sliders: {
    selfMoodValue: number;
    mealValue: number;
    healthValue: number;
  } | null;
};

export type LetterMutationValues = Record<string, unknown>;

export type LetterRepository = {
  findById(id: string, authorId: string): Promise<LetterRecord | null>;
  insert(values: LetterMutationValues): Promise<{ letter: LetterRecord | null; error: string | null }>;
  update(input: {
    id: string;
    authorId: string;
    expectedVersion: number;
    allowedStatuses: LetterStatus[];
    values: LetterMutationValues;
  }): Promise<{ letter: LetterRecord | null; error: string | null }>;
  delete(input: {
    id: string;
    authorId: string;
    expectedVersion: number;
    allowedStatuses: LetterStatus[];
  }): Promise<{ deleted: boolean; error: string | null }>;
};

const slidersSchema = z.object({
  selfMoodValue: z.number().int().min(1).max(5),
  mealValue: z.number().int().min(1).max(5),
  healthValue: z.number().int().min(1).max(5),
});

const LETTER_BODY_MAX_LENGTH = 50_000;
const SHORT_TEXT_MAX_LENGTH = 7;

function shortTextSchema(label: string, required: boolean) {
  return z
    .string()
    .trim()
    .refine((value) => !required || countCharacters(value) >= 1, {
      message: `${label}不能为空`,
    })
    .refine((value) => countCharacters(value) <= SHORT_TEXT_MAX_LENGTH, {
      message: `${label}最多${SHORT_TEXT_MAX_LENGTH}个字`,
    });
}

export const draftSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(["daily", "time_capsule"]),
  letterDate: z.iso.date(),
  salutation: shortTextSchema("称呼", false),
  bodyJson: z.record(z.string(), z.unknown()),
  bodyText: z.string().max(LETTER_BODY_MAX_LENGTH),
  sevenCharLine: shortTextSchema("总而言之，我想跟你说", false),
  version: z.number().int().nonnegative(),
  sliders: slidersSchema.nullable(),
  scheduledFor: z.iso.datetime({ offset: true }).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationRecordedAt: z.iso.datetime().optional(),
});

export type DraftInput = z.input<typeof draftSchema>;

export const scheduleSchema = draftSchema.extend({
  id: z.uuid(),
  kind: z.literal("time_capsule"),
  salutation: shortTextSchema("称呼", true),
  bodyText: z.string().trim().min(1).max(LETTER_BODY_MAX_LENGTH),
  sevenCharLine: shortTextSchema("总而言之，我想跟你说", true),
  scheduledFor: z.iso.datetime({ offset: true }),
});

const transitionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
});

export const publishableLetterSchema = z.object({
  kind: z.literal("daily"),
  letterDate: z.iso.date(),
  salutation: shortTextSchema("称呼", true),
  bodyJson: z.record(z.string(), z.unknown()),
  bodyText: z.string().trim().min(1).max(LETTER_BODY_MAX_LENGTH),
  sevenCharLine: shortTextSchema("总而言之，我想跟你说", true),
  sliders: slidersSchema,
});

export type ScheduleLetterInput = z.input<typeof scheduleSchema>;
export type LetterTransitionInput = z.input<typeof transitionSchema>;

export type LetterMutationResult =
  | { ok: true; message: string; letter?: LetterRecord }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "NOT_FOUND" | "LETTER_LOCKED" | "VERSION_CONFLICT" | "DATABASE_ERROR";
      message: string;
    };

export async function saveDraft(
  repo: LetterRepository,
  userId: string,
  input: DraftInput,
): Promise<LetterMutationResult> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "草稿内容无效" };
  }

  const draft = parsed.data;
  const values: LetterMutationValues = {
    kind: draft.kind,
    salutation: draft.salutation || null,
    body: draft.bodyText || null,
    body_json: draft.bodyJson,
    body_text: draft.bodyText || null,
    seven_char_line: draft.sevenCharLine || null,
    self_mood_value: draft.sliders?.selfMoodValue ?? null,
    meal_value: draft.sliders?.mealValue ?? null,
    health_value: draft.sliders?.healthValue ?? null,
    last_autosaved_at: new Date().toISOString(),
    scheduled_for:
      draft.kind === "time_capsule" ? (draft.scheduledFor ?? null) : null,
  };

  if (draft.latitude !== undefined && draft.longitude !== undefined) {
    values.latitude = draft.latitude;
    values.longitude = draft.longitude;
    values.location_recorded_at = draft.locationRecordedAt ?? new Date().toISOString();
  }

  if (!draft.id) {
    const { letter, error } = await repo.insert({
      ...values,
      author_id: userId,
      letter_date: draft.letterDate,
      status: "draft",
    });

    if (error) return { ok: false, code: "DATABASE_ERROR", message: error };
    if (!letter) return { ok: false, code: "DATABASE_ERROR", message: "草稿保存失败" };
    return { ok: true, message: "草稿已保存", letter };
  }

  const existing = await repo.findById(draft.id, userId);

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
  }

  if (existing.status !== "draft") {
    return { ok: false, code: "LETTER_LOCKED", message: "这封信已经封存，不能再修改" };
  }

  if (existing.version !== draft.version) {
    return { ok: false, code: "VERSION_CONFLICT", message: "草稿已在另一处更新，请刷新后重试" };
  }

  const { letter, error } = await repo.update({
    id: draft.id,
    authorId: userId,
    expectedVersion: draft.version,
    allowedStatuses: ["draft"],
    values,
  });

  if (error) return { ok: false, code: "DATABASE_ERROR", message: error };
  if (!letter) {
    const current = await repo.findById(draft.id, userId);
    if (!current) return { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
    if (current.status !== "draft") {
      return { ok: false, code: "LETTER_LOCKED", message: "这封信已经封存，不能再修改" };
    }
    return { ok: false, code: "VERSION_CONFLICT", message: "草稿已在另一处更新，请刷新后重试" };
  }

  return { ok: true, message: "草稿已保存", letter };
}

function validationError(message: string): LetterMutationResult {
  return { ok: false, code: "VALIDATION_ERROR", message };
}

async function resolveEmptyUpdate(
  repo: LetterRepository,
  userId: string,
  id: string,
  allowedStatuses: LetterStatus[],
): Promise<LetterMutationResult> {
  const current = await repo.findById(id, userId);
  if (!current) return { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
  if (!allowedStatuses.includes(current.status)) {
    return { ok: false, code: "LETTER_LOCKED", message: "这封信当前不能执行此操作" };
  }
  return { ok: false, code: "VERSION_CONFLICT", message: "这封信已在另一处更新，请刷新后重试" };
}

function contentValues(input: z.output<typeof draftSchema>): LetterMutationValues {
  return {
    kind: input.kind,
    salutation: input.salutation || null,
    body: input.bodyText || null,
    body_json: input.bodyJson,
    body_text: input.bodyText || null,
    seven_char_line: input.sevenCharLine || null,
    self_mood_value: input.sliders?.selfMoodValue ?? null,
    meal_value: input.sliders?.mealValue ?? null,
    health_value: input.sliders?.healthValue ?? null,
    last_autosaved_at: new Date().toISOString(),
    scheduled_for:
      input.kind === "time_capsule" ? (input.scheduledFor ?? null) : null,
  };
}

export async function scheduleLetter(
  repo: LetterRepository,
  userId: string,
  input: ScheduleLetterInput,
  now = new Date(),
): Promise<LetterMutationResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "预约内容无效");
  const scheduleValidation = validateSchedule("time_capsule", parsed.data.scheduledFor, now);
  if (!scheduleValidation.ok) return validationError(scheduleValidation.message);

  const existing = await repo.findById(parsed.data.id, userId);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { ok: false, code: "LETTER_LOCKED", message: "这封信当前不能预约" };
  }
  if (existing.version !== parsed.data.version) {
    return { ok: false, code: "VERSION_CONFLICT", message: "这封信已在另一处更新，请刷新后重试" };
  }

  const { letter, error } = await repo.update({
    id: parsed.data.id,
    authorId: userId,
    expectedVersion: parsed.data.version,
    allowedStatuses: ["draft", "scheduled"],
    values: {
      ...contentValues(parsed.data),
      status: "scheduled",
      scheduled_for: parsed.data.scheduledFor,
    },
  });
  if (error) return { ok: false, code: "DATABASE_ERROR", message: error };
  if (!letter) return resolveEmptyUpdate(repo, userId, parsed.data.id, ["draft", "scheduled"]);
  return { ok: true, message: "时光信已预约", letter };
}

export async function publishDailyLetter(
  repo: LetterRepository,
  userId: string,
  input: LetterTransitionInput,
): Promise<LetterMutationResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "发布参数无效");
  const existing = await repo.findById(parsed.data.id, userId);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
  if (existing.status !== "draft") return { ok: false, code: "LETTER_LOCKED", message: "只有草稿可以发布" };
  if (existing.version !== parsed.data.version) {
    return { ok: false, code: "VERSION_CONFLICT", message: "这封信已在另一处更新，请刷新后重试" };
  }
  const complete = publishableLetterSchema.safeParse(existing);
  if (!complete.success) return validationError(complete.error.issues[0]?.message ?? "请先补全信件内容");

  const { letter, error } = await repo.update({
    id: parsed.data.id,
    authorId: userId,
    expectedVersion: parsed.data.version,
    allowedStatuses: ["draft"],
    values: { status: "published" },
  });
  if (error) return { ok: false, code: "DATABASE_ERROR", message: error };
  if (!letter) return resolveEmptyUpdate(repo, userId, parsed.data.id, ["draft"]);
  return { ok: true, message: "今日信已发布", letter };
}

export async function returnScheduledToDraft(
  repo: LetterRepository,
  userId: string,
  input: LetterTransitionInput,
): Promise<LetterMutationResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "参数无效");
  const existing = await repo.findById(parsed.data.id, userId);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
  if (existing.status !== "scheduled") return { ok: false, code: "LETTER_LOCKED", message: "只有预约信可以退回草稿" };
  if (existing.version !== parsed.data.version) {
    return { ok: false, code: "VERSION_CONFLICT", message: "这封信已在另一处更新，请刷新后重试" };
  }
  const { letter, error } = await repo.update({
    id: parsed.data.id,
    authorId: userId,
    expectedVersion: parsed.data.version,
    allowedStatuses: ["scheduled"],
    values: { status: "draft", scheduled_for: null },
  });
  if (error) return { ok: false, code: "DATABASE_ERROR", message: error };
  if (!letter) return resolveEmptyUpdate(repo, userId, parsed.data.id, ["scheduled"]);
  return { ok: true, message: "已退回草稿", letter };
}

export async function deletePrivateLetter(
  repo: LetterRepository,
  userId: string,
  input: LetterTransitionInput,
): Promise<LetterMutationResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "参数无效");
  const existing = await repo.findById(parsed.data.id, userId);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { ok: false, code: "LETTER_LOCKED", message: "已发布的信不能删除" };
  }
  if (existing.version !== parsed.data.version) {
    return { ok: false, code: "VERSION_CONFLICT", message: "这封信已在另一处更新，请刷新后重试" };
  }
  const { deleted, error } = await repo.delete({
    id: parsed.data.id,
    authorId: userId,
    expectedVersion: parsed.data.version,
    allowedStatuses: ["draft", "scheduled"],
  });
  if (error) return { ok: false, code: "DATABASE_ERROR", message: error };
  if (!deleted) return resolveEmptyUpdate(repo, userId, parsed.data.id, ["draft", "scheduled"]);
  return { ok: true, message: "私密信件已删除" };
}

export async function withdrawPublishedLetter(
  repo: LetterRepository,
  userId: string,
  input: LetterTransitionInput,
  now = new Date(),
): Promise<LetterMutationResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "参数无效");
  const existing = await repo.findById(parsed.data.id, userId);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
  if (existing.status !== "published") return { ok: false, code: "LETTER_LOCKED", message: "只有已发布的信可以撤回" };
  if (!existing.publishedAt || !canWithdrawLetter(existing.publishedAt, now)) {
    return { ok: false, code: "LETTER_LOCKED", message: "发布超过 24 小时后不能撤回" };
  }
  if (existing.version !== parsed.data.version) {
    return { ok: false, code: "VERSION_CONFLICT", message: "这封信已在另一处更新，请刷新后重试" };
  }
  const { letter, error } = await repo.update({
    id: parsed.data.id,
    authorId: userId,
    expectedVersion: parsed.data.version,
    allowedStatuses: ["published"],
    values: { status: "withdrawn" },
  });
  if (error) return { ok: false, code: "DATABASE_ERROR", message: error };
  if (!letter) return resolveEmptyUpdate(repo, userId, parsed.data.id, ["published"]);
  return { ok: true, message: "信件已撤回并清空内容", letter };
}

const letterSelection =
  "id, author_id, status, kind, version, published_at, letter_date, scheduled_for, salutation, body_json, body_text, seven_char_line, self_mood_value, meal_value, health_value";

export function mapLetterRecord(row: Record<string, unknown>): LetterRecord {
  const bodyJson = row.body_json;
  const hasSliders = row.self_mood_value !== null && row.meal_value !== null && row.health_value !== null;
  return {
    id: String(row.id),
    authorId: String(row.author_id),
    status: String(row.status) as LetterStatus,
    kind: String(row.kind) as LetterKind,
    version: Number(row.version),
    publishedAt: row.published_at ? String(row.published_at) : null,
    letterDate: String(row.letter_date),
    salutation: row.salutation === null ? null : String(row.salutation),
    bodyJson: bodyJson && typeof bodyJson === "object" && !Array.isArray(bodyJson) ? (bodyJson as Record<string, unknown>) : null,
    bodyText: row.body_text === null ? null : String(row.body_text),
    sevenCharLine: row.seven_char_line === null ? null : String(row.seven_char_line),
    scheduledFor: row.scheduled_for == null ? null : String(row.scheduled_for),
    sliders: hasSliders
      ? {
          selfMoodValue: Number(row.self_mood_value),
          mealValue: Number(row.meal_value),
          healthValue: Number(row.health_value),
        }
      : null,
  };
}

export type OwnLetterSnapshotResult =
  | { ok: true; letter: LetterRecord }
  | { ok: false; code: "VALIDATION_ERROR" | "NOT_FOUND" | "DATABASE_ERROR"; message: string };

export async function getOwnLetterSnapshot(
  repo: LetterRepository,
  userId: string,
  id: string,
): Promise<OwnLetterSnapshotResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "草稿编号无效" };
  }
  try {
    const letter = await repo.findById(parsed.data, userId);
    return letter
      ? { ok: true, letter }
      : { ok: false, code: "NOT_FOUND", message: "没有找到这封信" };
  } catch (error) {
    return {
      ok: false,
      code: "DATABASE_ERROR",
      message: error instanceof Error ? error.message : "读取草稿失败",
    };
  }
}

export function createLetterRepository(supabase: SupabaseClient): LetterRepository {
  return {
    async findById(id, authorId) {
      const { data, error } = await supabase
        .from("letters")
        .select(letterSelection)
        .eq("id", id)
        .eq("author_id", authorId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapLetterRecord(data) : null;
    },
    async insert(values) {
      const { data, error } = await supabase.from("letters").insert(values).select(letterSelection).single();
      return { letter: data ? mapLetterRecord(data) : null, error: error?.message ?? null };
    },
    async update({ id, authorId, expectedVersion, allowedStatuses, values }) {
      const { data, error } = await supabase
        .from("letters")
        .update(values)
        .eq("id", id)
        .eq("author_id", authorId)
        .eq("version", expectedVersion)
        .in("status", allowedStatuses)
        .select(letterSelection)
        .maybeSingle();
      return { letter: data ? mapLetterRecord(data) : null, error: error?.message ?? null };
    },
    async delete({ id, authorId, expectedVersion, allowedStatuses }) {
      const { data, error } = await supabase
        .from("letters")
        .delete()
        .eq("id", id)
        .eq("author_id", authorId)
        .eq("version", expectedVersion)
        .in("status", allowedStatuses)
        .select("id")
        .maybeSingle();
      return { deleted: Boolean(data), error: error?.message ?? null };
    },
  };
}

async function getActionContext() {
  const [{ requireUser }, { createServerSupabaseClient }] = await Promise.all([
    import("@/lib/auth/require-user"),
    import("@/lib/supabase/server"),
  ]);
  const [{ userId }, supabase] = await Promise.all([requireUser(), createServerSupabaseClient()]);
  return { userId, supabase, repo: createLetterRepository(supabase) };
}

async function revalidateLetterPaths(letter?: LetterRecord) {
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  revalidatePath("/write");
  if (letter?.letterDate) revalidatePath(`/letters/${letter.letterDate}`);
}

export async function saveDraftAction(input: DraftInput): Promise<LetterMutationResult> {
  "use server";
  const { userId, repo } = await getActionContext();
  const result = await saveDraft(repo, userId, input);
  if (result.ok) await revalidateLetterPaths(result.letter);
  return result;
}

export async function getOwnLetterSnapshotAction(id: string): Promise<OwnLetterSnapshotResult> {
  "use server";
  const { userId, repo } = await getActionContext();
  return getOwnLetterSnapshot(repo, userId, id);
}

export async function scheduleLetterAction(input: ScheduleLetterInput): Promise<LetterMutationResult> {
  "use server";
  const { userId, repo } = await getActionContext();
  const result = await scheduleLetter(repo, userId, input);
  if (result.ok) await revalidateLetterPaths(result.letter);
  return result;
}

export async function publishDailyLetterAction(input: LetterTransitionInput): Promise<LetterMutationResult> {
  "use server";
  const { userId, repo } = await getActionContext();
  const result = await publishDailyLetter(repo, userId, input);
  if (result.ok) await revalidateLetterPaths(result.letter);
  return result;
}

export async function returnScheduledToDraftAction(input: LetterTransitionInput): Promise<LetterMutationResult> {
  "use server";
  const { userId, repo } = await getActionContext();
  const result = await returnScheduledToDraft(repo, userId, input);
  if (result.ok) await revalidateLetterPaths(result.letter);
  return result;
}

export async function deletePrivateLetterAction(input: LetterTransitionInput): Promise<LetterMutationResult> {
  "use server";
  const { userId, supabase } = await getActionContext();
  const {
    createPrivateLetterDeletionGateway,
    deletePrivateLetterWithAssets,
  } = await import("./private-letter-deletion");
  const result = await deletePrivateLetterWithAssets(
    createPrivateLetterDeletionGateway(supabase),
    userId,
    input,
  );
  if (result.ok) await revalidateLetterPaths();
  return result;
}

export async function withdrawPublishedLetterAction(input: LetterTransitionInput): Promise<LetterMutationResult> {
  "use server";
  const { userId, repo } = await getActionContext();
  const result = await withdrawPublishedLetter(repo, userId, input);
  if (result.ok) await revalidateLetterPaths(result.letter);
  return result;
}

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

function plainTextDocument(body: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: body ? [{ type: "text", text: body }] : [] }],
  };
}

export async function saveLetterAction(input: SaveLetterInput): Promise<ActionResult> {
  "use server";
  const { userId, supabase, repo } = await getActionContext();
  const { getChinaDateString } = await import("@/lib/date/china-day");
  const today = getChinaDateString();
  const { data, error } = await supabase
    .from("letters")
    .select("id, version, status")
    .eq("author_id", userId)
    .eq("letter_date", today)
    .eq("kind", "daily")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (data && String(data.status) !== "draft") return { ok: false, message: "这封信已经封存，不能再修改" };

  const result = await saveDraft(repo, userId, {
    id: data ? String(data.id) : undefined,
    kind: "daily",
    letterDate: today,
    salutation: "亲爱的",
    bodyJson: plainTextDocument(input.body),
    bodyText: input.body,
    sevenCharLine: input.sevenCharLine,
    version: data ? Number(data.version) : 0,
    sliders: {
      selfMoodValue: input.selfMoodValue,
      mealValue: input.mealValue,
      healthValue: input.healthValue,
    },
    latitude: input.latitude,
    longitude: input.longitude,
    locationRecordedAt: input.locationRecordedAt,
  });
  if (result.ok) await revalidateLetterPaths(result.letter);
  return { ok: result.ok, message: result.message };
}

export async function createOpenResponseAction(input: { letterId: string; responseText: string }): Promise<ActionResult> {
  "use server";
  const [{ requireUser }, { createServerSupabaseClient }, { validateOpenResponse }] = await Promise.all([
    import("@/lib/auth/require-user"),
    import("@/lib/supabase/server"),
    import("@/features/letters/rules"),
  ]);
  const { userId, profile } = await requireUser();
  const supabase = await createServerSupabaseClient();
  let responseText: string;
  try {
    responseText = validateOpenResponse(input.responseText);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "回应不符合要求" };
  }
  const { data: letter, error: letterError } = await supabase
    .from("letters")
    .select("id, author_id")
    .eq("id", input.letterId)
    .eq("status", "published")
    .single();
  if (letterError || !letter) return { ok: false, message: letterError?.message ?? "没有找到这封信" };
  if (String(letter.author_id) === userId) return { ok: true, message: "自己的信可以直接展开" };

  const { data: existing, error: existingError } = await supabase
    .from("letter_open_responses")
    .select("id")
    .eq("letter_id", input.letterId)
    .eq("reader_id", userId)
    .maybeSingle();
  if (existingError) return { ok: false, message: existingError.message };
  if (!existing) {
    const { error } = await supabase.from("letter_open_responses").insert({
      letter_id: input.letterId,
      reader_id: userId,
      response_text: responseText,
    });
    if (error) return { ok: false, message: error.message };
    await supabase.from("notifications").insert({
      recipient_id: String(letter.author_id),
      type: "letter_opened",
      source_id: input.letterId,
      title: `${profile.display_name} 展开了你的信`,
      body: `回应：${responseText}`,
    });
  }
  await revalidateLetterPaths();
  return { ok: true, message: "展信啦" };
}
