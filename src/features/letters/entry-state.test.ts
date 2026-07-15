import { describe, expect, it } from "vitest";

import {
  mapTodayWritingEntry,
  selectTodayEntryRow,
  type TodayLetterRow,
} from "./queries";

const completeDraft: TodayLetterRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "draft",
  kind: "daily",
  version: 4,
  letter_date: "2026-07-15",
  salutation: "亲爱的老婆",
  body_json: { type: "doc", content: [] },
  body_text: "草稿正文",
  self_mood_value: 5,
  meal_value: 4,
  health_value: 3,
  seven_char_line: "平安到家",
  scheduled_for: null,
  updated_at: "2026-07-15T09:00:00+08:00",
};

describe("today writing entry mapping", () => {
  it("resumes a complete daily draft at compose without losing persistence metadata", () => {
    const entry = mapTodayWritingEntry("2026-07-15", completeDraft);

    expect(entry.availability).toBe("draft");
    if (entry.availability !== "draft") throw new Error("expected draft entry");
    expect(entry.initialDraft.state).toEqual({
      step: "compose",
      kind: "daily",
      today: "2026-07-15",
      answers: { mood: 5, meal: 4, health: 3 },
      salutation: "亲爱的老婆",
    });
    expect(entry.initialDraft.metadata).toMatchObject({
      id: completeDraft.id,
      version: 4,
      bodyText: "草稿正文",
      finalLine: "平安到家",
    });
  });

  it("safely resumes at the first missing daily question while retaining the draft id", () => {
    const entry = mapTodayWritingEntry("2026-07-15", {
      ...completeDraft,
      meal_value: null,
      health_value: null,
    });

    expect(entry.availability).toBe("draft");
    if (entry.availability !== "draft") throw new Error("expected draft entry");
    expect(entry.initialDraft.state).toEqual({
      step: "meal",
      kind: "daily",
      today: "2026-07-15",
      answers: { mood: 5 },
    });
    expect(entry.initialDraft.metadata.id).toBe(completeDraft.id);
    expect(entry.initialDraft.metadata.salutation).toBe("亲爱的老婆");
  });

  it("gates an already published daily letter to its read-only date page", () => {
    const entry = mapTodayWritingEntry("2026-07-15", {
      ...completeDraft,
      status: "published",
    });

    expect(entry).toEqual({
      availability: "published",
      today: "2026-07-15",
      letterId: completeDraft.id,
      href: "/letters/2026-07-15",
    });
  });

  it("prioritizes an older published terminal row over a newer draft", () => {
    const draft = {
      ...completeDraft,
      id: "22222222-2222-4222-8222-222222222222",
      updated_at: "2026-07-15T11:00:00+08:00",
    };
    const published = {
      ...completeDraft,
      id: "33333333-3333-4333-8333-333333333333",
      status: "published",
      updated_at: "2026-07-15T08:00:00+08:00",
    };

    expect(selectTodayEntryRow([draft, published])).toEqual(published);
  });

  it("prioritizes an older withdrawn terminal row over a newer draft", () => {
    const draft = {
      ...completeDraft,
      id: "44444444-4444-4444-8444-444444444444",
      updated_at: "2026-07-15T11:00:00+08:00",
    };
    const withdrawn = {
      ...completeDraft,
      id: "55555555-5555-4555-8555-555555555555",
      status: "withdrawn",
      updated_at: "2026-07-15T07:00:00+08:00",
    };

    expect(selectTodayEntryRow([draft, withdrawn])).toEqual(withdrawn);
  });

  it("uses the newest terminal row if legacy published and withdrawn rows coexist", () => {
    const published = {
      ...completeDraft,
      status: "published",
      updated_at: "2026-07-15T08:00:00+08:00",
    };
    const withdrawn = {
      ...completeDraft,
      id: "66666666-6666-4666-8666-666666666666",
      status: "withdrawn",
      updated_at: "2026-07-15T09:00:00+08:00",
    };

    expect(selectTodayEntryRow([published, withdrawn])).toEqual(withdrawn);
  });
});
