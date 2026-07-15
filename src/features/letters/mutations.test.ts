import { describe, expect, it, vi } from "vitest";
import {
  draftSchema,
  deletePrivateLetter,
  publishDailyLetter,
  publishableLetterSchema,
  returnScheduledToDraft,
  saveDraft,
  scheduleLetter,
  scheduleSchema,
  withdrawPublishedLetter,
  saveLetterAction,
  getOwnLetterSnapshot,
  mapLetterRecord,
  type LetterRecord,
  type LetterRepository,
} from "./mutations";

const userId = "11111111-1111-4111-8111-111111111111";
const letterId = "22222222-2222-4222-8222-222222222222";
const bodyAtLimit = "x".repeat(50_000);
const bodyOverLimit = `${bodyAtLimit}x`;

function fakeLetterRepo(overrides: Partial<LetterRecord> = {}) {
  const letter: LetterRecord = {
    id: letterId,
    authorId: userId,
    status: "draft",
    kind: "daily",
    version: 1,
    publishedAt: null,
    letterDate: "2026-07-15",
    salutation: "亲爱的",
    bodyJson: { type: "doc", content: [] },
    bodyText: "今天很好。",
    sevenCharLine: "日日是好日",
    sliders: { selfMoodValue: 5, mealValue: 4, healthValue: 3 },
    scheduledFor: null,
    ...overrides,
  };

  return {
    findById: vi.fn<LetterRepository["findById"]>(async () => letter),
    insert: vi.fn<LetterRepository["insert"]>(),
    update: vi.fn<LetterRepository["update"]>(),
    delete: vi.fn<LetterRepository["delete"]>(),
  } satisfies LetterRepository;
}

const draftInput = {
  id: letterId,
  kind: "daily" as const,
  letterDate: "2026-07-15",
  salutation: "亲爱的",
  bodyJson: { type: "doc", content: [] },
  bodyText: "今天很好。",
  sevenCharLine: "日日是好日",
  version: 1,
  sliders: { selfMoodValue: 5, mealValue: 4, healthValue: 3 },
};

describe("letter mutations", () => {
  it("allows empty short text in drafts and counts Unicode code points at the 7/8 boundary", () => {
    expect(draftSchema.safeParse({ ...draftInput, salutation: "", sevenCharLine: "" }).success).toBe(true);
    expect(
      draftSchema.safeParse({
        ...draftInput,
        salutation: "😀😀😀😀😀😀😀",
        sevenCharLine: "😀😀😀😀😀😀😀",
      }).success,
    ).toBe(true);
    expect(
      draftSchema.safeParse({
        ...draftInput,
        salutation: "😀😀😀😀😀😀😀😀",
        sevenCharLine: "😀😀😀😀😀😀😀😀",
      }).success,
    ).toBe(false);
  });

  it("requires completed letters' short text and counts Unicode code points at 7/8", () => {
    const scheduled = {
      ...draftInput,
      kind: "time_capsule" as const,
      scheduledFor: "2099-07-16T08:30:00.000Z",
    };
    const published = {
      ...draftInput,
      kind: "daily" as const,
    };

    for (const [schema, input] of [
      [scheduleSchema, scheduled],
      [publishableLetterSchema, published],
    ] as const) {
      expect(schema.safeParse({ ...input, salutation: "", sevenCharLine: "" }).success).toBe(false);
      expect(
        schema.safeParse({
          ...input,
          salutation: "😀😀😀😀😀😀😀",
          sevenCharLine: "😀😀😀😀😀😀😀",
        }).success,
      ).toBe(true);
      expect(
        schema.safeParse({
          ...input,
          salutation: "😀😀😀😀😀😀😀😀",
          sevenCharLine: "😀😀😀😀😀😀😀😀",
        }).success,
      ).toBe(false);
    }
  });

  it("accepts a 50,000-character draft body and rejects 50,001 characters", async () => {
    const acceptedRepo = fakeLetterRepo();
    acceptedRepo.update.mockResolvedValue({
      letter: { ...await acceptedRepo.findById(letterId, userId), bodyText: bodyAtLimit, version: 2 } as LetterRecord,
      error: null,
    });

    const accepted = await saveDraft(acceptedRepo, userId, { ...draftInput, bodyText: bodyAtLimit });

    expect(accepted.ok).toBe(true);
    expect(acceptedRepo.update).toHaveBeenCalledOnce();

    const rejectedRepo = fakeLetterRepo();
    const rejected = await saveDraft(rejectedRepo, userId, { ...draftInput, bodyText: bodyOverLimit });

    expect(rejected).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(rejectedRepo.findById).not.toHaveBeenCalled();
  });

  it("accepts a 50,000-character scheduled body and rejects 50,001 characters", async () => {
    const acceptedRepo = fakeLetterRepo({ kind: "time_capsule" });
    acceptedRepo.update.mockResolvedValue({
      letter: {
        ...await acceptedRepo.findById(letterId, userId),
        status: "scheduled",
        bodyText: bodyAtLimit,
        version: 2,
      } as LetterRecord,
      error: null,
    });

    const accepted = await scheduleLetter(acceptedRepo, userId, {
      ...draftInput,
      kind: "time_capsule",
      bodyText: bodyAtLimit,
      scheduledFor: "2099-07-16T08:30:00.000Z",
    });

    expect(accepted.ok).toBe(true);
    expect(acceptedRepo.update).toHaveBeenCalledOnce();

    const rejectedRepo = fakeLetterRepo({ kind: "time_capsule" });
    const rejected = await scheduleLetter(rejectedRepo, userId, {
      ...draftInput,
      kind: "time_capsule",
      bodyText: bodyOverLimit,
      scheduledFor: "2099-07-16T08:30:00.000Z",
    });

    expect(rejected).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(rejectedRepo.findById).not.toHaveBeenCalled();
  });

  it("publishes a 50,000-character body and rejects 50,001 characters", async () => {
    const acceptedRepo = fakeLetterRepo({ bodyText: bodyAtLimit });
    acceptedRepo.update.mockResolvedValue({
      letter: {
        ...await acceptedRepo.findById(letterId, userId),
        status: "published",
        bodyText: bodyAtLimit,
        version: 2,
      } as LetterRecord,
      error: null,
    });

    const accepted = await publishDailyLetter(acceptedRepo, userId, { id: letterId, version: 1 });

    expect(accepted.ok).toBe(true);
    expect(acceptedRepo.update).toHaveBeenCalledOnce();

    const rejectedRepo = fakeLetterRepo({ bodyText: bodyOverLimit });
    const rejected = await publishDailyLetter(rejectedRepo, userId, { id: letterId, version: 1 });

    expect(rejected).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(rejectedRepo.update).not.toHaveBeenCalled();
  });

  it("never updates content after publication", async () => {
    const repo = fakeLetterRepo({ status: "published" });

    const result = await saveDraft(repo, userId, { ...draftInput, bodyText: "changed" });

    expect(result).toMatchObject({ ok: false, code: "LETTER_LOCKED" });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("rejects stale autosave versions", async () => {
    const repo = fakeLetterRepo({ status: "draft", version: 4 });

    const result = await saveDraft(repo, userId, { ...draftInput, version: 3, bodyText: "old" });

    expect(result).toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("rejects invalid draft input before accessing the repository", async () => {
    const repo = fakeLetterRepo();

    const result = await saveDraft(repo, userId, {
      ...draftInput,
      id: "not-a-uuid",
      letterDate: "15/07/2026",
      sliders: { selfMoodValue: 6, mealValue: 4, healthValue: 3 },
    });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("inserts an incomplete draft with nullable fields", async () => {
    const repo = fakeLetterRepo();
    repo.insert.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), version: 1 } as LetterRecord,
      error: null,
    });
    repo.findById.mockClear();

    const result = await saveDraft(repo, userId, {
      ...draftInput,
      id: undefined,
      salutation: "",
      bodyText: "",
      sevenCharLine: "",
      version: 0,
      sliders: null,
    });

    expect(result).toMatchObject({ ok: true, letter: { version: 1 } });
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        author_id: userId,
        status: "draft",
        salutation: null,
        body_text: null,
        seven_char_line: null,
        self_mood_value: null,
      }),
    );
  });

  it("persists and maps an exact time-capsule delivery timestamp while daily drafts clear it", async () => {
    const capsuleRepo = fakeLetterRepo({
      kind: "time_capsule",
      scheduledFor: "2026-08-01T00:30:00+08:00",
    });
    capsuleRepo.insert.mockResolvedValue({
      letter: { ...await capsuleRepo.findById(letterId, userId), version: 1 } as LetterRecord,
      error: null,
    });
    capsuleRepo.findById.mockClear();

    await saveDraft(capsuleRepo, userId, {
      ...draftInput,
      id: undefined,
      version: 0,
      kind: "time_capsule",
      scheduledFor: "2026-08-01T00:30:00+08:00",
      sliders: null,
    });
    expect(capsuleRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ scheduled_for: "2026-08-01T00:30:00+08:00" }),
    );

    const dailyRepo = fakeLetterRepo();
    dailyRepo.update.mockResolvedValue({
      letter: { ...await dailyRepo.findById(letterId, userId), version: 2 } as LetterRecord,
      error: null,
    });
    await saveDraft(dailyRepo, userId, {
      ...draftInput,
      scheduledFor: "2026-08-01T00:30:00+08:00",
    });
    expect(dailyRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ values: expect.objectContaining({ scheduled_for: null }) }),
    );

    expect(
      mapLetterRecord({
        id: letterId,
        author_id: userId,
        status: "draft",
        kind: "time_capsule",
        version: 2,
        published_at: null,
        letter_date: "2026-08-01",
        scheduled_for: "2026-08-01T00:30:00+08:00",
        salutation: "未来的你",
        body_json: { type: "doc" },
        body_text: "正文",
        seven_char_line: null,
        self_mood_value: null,
        meal_value: null,
        health_value: null,
      }).scheduledFor,
    ).toBe("2026-08-01T00:30:00+08:00");
  });

  it("returns only the authenticated author's latest letter snapshot and exposes locked status", async () => {
    const draftRepo = fakeLetterRepo({
      kind: "time_capsule",
      scheduledFor: "2026-08-01T00:30:00+08:00",
    });
    await expect(getOwnLetterSnapshot(draftRepo, userId, letterId)).resolves.toMatchObject({
      ok: true,
      letter: { status: "draft", scheduledFor: "2026-08-01T00:30:00+08:00" },
    });

    const lockedRepo = fakeLetterRepo({ status: "published" });
    await expect(getOwnLetterSnapshot(lockedRepo, userId, letterId)).resolves.toMatchObject({
      ok: true,
      letter: { status: "published" },
    });
    expect(lockedRepo.findById).toHaveBeenCalledWith(letterId, userId);
  });

  it("updates a draft only at the expected version", async () => {
    const repo = fakeLetterRepo();
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), version: 2 } as LetterRecord,
      error: null,
    });

    const result = await saveDraft(repo, userId, draftInput);

    expect(result).toMatchObject({ ok: true, letter: { version: 2 } });
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: letterId,
        authorId: userId,
        expectedVersion: 1,
        allowedStatuses: ["draft"],
      }),
    );
  });

  it("reports a version conflict when an atomic draft update loses a race", async () => {
    const repo = fakeLetterRepo();
    repo.update.mockResolvedValue({ letter: null, error: null });
    repo.findById
      .mockResolvedValueOnce({ ...(await repo.findById(letterId, userId)), version: 1 } as LetterRecord)
      .mockResolvedValueOnce({ ...(await repo.findById(letterId, userId)), version: 2 } as LetterRecord);

    const result = await saveDraft(repo, userId, draftInput);

    expect(result).toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
  });

  it("saves complete time-capsule content while scheduling it", async () => {
    const repo = fakeLetterRepo({ kind: "time_capsule" });
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), status: "scheduled", version: 2 } as LetterRecord,
      error: null,
    });

    const result = await scheduleLetter(repo, userId, {
      ...draftInput,
      kind: "time_capsule",
      bodyText: `  ${draftInput.bodyText}\n`,
      scheduledFor: "2099-07-16T08:30:00.000Z",
    });

    expect(result).toMatchObject({ ok: true, letter: { status: "scheduled" } });
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedStatuses: ["draft", "scheduled"],
        values: expect.objectContaining({
          status: "scheduled",
          scheduled_for: "2099-07-16T08:30:00.000Z",
          body_text: draftInput.bodyText,
        }),
      }),
    );
  });

  it("rejects scheduling later on the same Shanghai day before repository access", async () => {
    const repo = fakeLetterRepo({ kind: "time_capsule" });

    const result = await scheduleLetter(
      repo,
      userId,
      {
        ...draftInput,
        kind: "time_capsule",
        scheduledFor: "2026-07-13T10:00:00Z",
      },
      new Date("2026-07-13T00:00:00Z"),
    );

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("accepts a future Shanghai day expressed with a different offset", async () => {
    const repo = fakeLetterRepo({ kind: "time_capsule" });
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), status: "scheduled", version: 2 } as LetterRecord,
      error: null,
    });
    repo.findById.mockClear();

    const result = await scheduleLetter(
      repo,
      userId,
      {
        ...draftInput,
        kind: "time_capsule",
        scheduledFor: "2026-07-14T08:30:00-04:00",
      },
      new Date("2026-07-13T00:00:00Z"),
    );

    expect(result).toMatchObject({ ok: true });
    expect(repo.update).toHaveBeenCalledOnce();
  });

  it("rejects a whitespace-only time-capsule body when scheduling", async () => {
    const repo = fakeLetterRepo({ kind: "time_capsule" });
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), status: "scheduled", version: 2 } as LetterRecord,
      error: null,
    });
    repo.findById.mockClear();

    const result = await scheduleLetter(repo, userId, {
      ...draftInput,
      kind: "time_capsule",
      bodyText: " \n\t ",
      scheduledFor: "2099-07-16T08:30:00.000Z",
    });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("schedules a complete time capsule without slider answers", async () => {
    const repo = fakeLetterRepo({ kind: "time_capsule", sliders: null });
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), status: "scheduled", version: 2 } as LetterRecord,
      error: null,
    });

    const result = await scheduleLetter(repo, userId, {
      ...draftInput,
      kind: "time_capsule",
      sliders: null,
      scheduledFor: "2099-07-16T08:30:00.000Z",
    });

    expect(result).toMatchObject({ ok: true, letter: { status: "scheduled" } });
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          self_mood_value: null,
          meal_value: null,
          health_value: null,
        }),
      }),
    );
  });

  it("publishes a complete daily draft with a status-only update", async () => {
    const repo = fakeLetterRepo();
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), status: "published", version: 2 } as LetterRecord,
      error: null,
    });

    const result = await publishDailyLetter(repo, userId, { id: letterId, version: 1 });

    expect(result).toMatchObject({ ok: true, letter: { status: "published" } });
    expect(repo.update).toHaveBeenCalledWith({
      id: letterId,
      authorId: userId,
      expectedVersion: 1,
      allowedStatuses: ["draft"],
      values: { status: "published" },
    });
  });

  it("does not publish an incomplete daily draft", async () => {
    const repo = fakeLetterRepo({ bodyText: null });

    const result = await publishDailyLetter(repo, userId, { id: letterId, version: 1 });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("does not publish a daily draft with a whitespace-only body", async () => {
    const repo = fakeLetterRepo({ bodyText: " \n\t " });
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), status: "published", version: 2 } as LetterRecord,
      error: null,
    });
    repo.findById.mockClear();

    const result = await publishDailyLetter(repo, userId, { id: letterId, version: 1 });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("returns a scheduled letter to draft and clears its schedule", async () => {
    const repo = fakeLetterRepo({ status: "scheduled", kind: "time_capsule" });
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), status: "draft", version: 2 } as LetterRecord,
      error: null,
    });

    const result = await returnScheduledToDraft(repo, userId, { id: letterId, version: 1 });

    expect(result.ok).toBe(true);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedStatuses: ["scheduled"],
        values: { status: "draft", scheduled_for: null },
      }),
    );
  });

  it("deletes only a private draft or scheduled letter", async () => {
    const repo = fakeLetterRepo({ status: "scheduled", kind: "time_capsule" });
    repo.delete.mockResolvedValue({ deleted: true, error: null });

    const result = await deletePrivateLetter(repo, userId, { id: letterId, version: 1 });

    expect(result.ok).toBe(true);
    expect(repo.delete).toHaveBeenCalledWith({
      id: letterId,
      authorId: userId,
      expectedVersion: 1,
      allowedStatuses: ["draft", "scheduled"],
    });
  });

  it("withdraws published content with a status-only update", async () => {
    const repo = fakeLetterRepo({ status: "published", publishedAt: new Date().toISOString() });
    repo.update.mockResolvedValue({
      letter: { ...await repo.findById(letterId, userId), status: "withdrawn", version: 2 } as LetterRecord,
      error: null,
    });

    const result = await withdrawPublishedLetter(repo, userId, { id: letterId, version: 1 });

    expect(result.ok).toBe(true);
    expect(repo.update).toHaveBeenCalledWith({
      id: letterId,
      authorId: userId,
      expectedVersion: 1,
      allowedStatuses: ["published"],
      values: { status: "withdrawn" },
    });
  });
});

describe("legacy daily save compatibility", () => {
  it("adds an explicit daily-kind filter to the same-date lookup", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "stop after lookup" } });
    const supabase = { from: vi.fn(() => query) };

    vi.doMock("@/lib/auth/require-user", () => ({
      requireUser: vi.fn(async () => ({ userId, profile: { display_name: "Tester" } })),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: vi.fn(async () => supabase),
    }));

    await saveLetterAction({
      body: "body",
      selfMoodValue: 3,
      mealValue: 3,
      healthValue: 3,
      sevenCharLine: "today",
    });

    expect(query.eq).toHaveBeenCalledWith("kind", "daily");
  });
});
