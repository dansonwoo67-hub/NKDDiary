import { describe, expect, it, vi } from "vitest";

import { buildComposerDraft, insertLetterImage } from "./LetterComposer";

describe("buildComposerDraft", () => {
  it("carries the daily ritual answers into a new autosaved draft", () => {
    expect(
      buildComposerDraft(
        {
          step: "compose",
          today: "2026-07-15",
          kind: "daily",
          salutation: "亲爱的",
          answers: { mood: 5, meal: 4, health: 3 },
        },
        null,
      ),
    ).toMatchObject({
      kind: "daily",
      letterDate: "2026-07-15",
      version: 0,
      sliders: { selfMoodValue: 5, mealValue: 4, healthValue: 3 },
    });
  });

  it("uses the Shanghai delivery date and no sliders for a time capsule", () => {
    expect(
      buildComposerDraft(
        {
          step: "compose",
          today: "2026-07-15",
          kind: "time_capsule",
          salutation: "未来的你",
          scheduledFor: "2026-08-01T00:30:00+08:00",
        },
        null,
      ),
    ).toMatchObject({
      kind: "time_capsule",
      letterDate: "2026-08-01",
      scheduledFor: "2026-08-01T00:30:00+08:00",
      sliders: null,
    });
  });

  it("resumes the server id, version, body and final line", () => {
    const result = buildComposerDraft(
      {
        step: "compose",
        today: "2026-07-15",
        kind: "daily",
        salutation: "老婆",
        answers: { mood: 4, meal: 5, health: 2 },
      },
      {
        id: "0f91b468-a6b7-46a0-a1ae-477be060fd4c",
        version: 7,
        letterDate: "2026-07-15",
        kind: "daily",
        status: "draft",
        salutation: "老婆",
        bodyJson: { type: "doc", content: [] },
        bodyText: "原来的正文",
        finalLine: "等你回家",
        scheduledFor: null,
        sliders: { mood: 4, meal: 5, health: 2 },
      },
    );

    expect(result).toMatchObject({
      id: "0f91b468-a6b7-46a0-a1ae-477be060fd4c",
      version: 7,
      bodyText: "原来的正文",
      finalLine: "等你回家",
    });
  });
});

describe("insertLetterImage", () => {
  it("inserts the stable route with the letter image attributes through TipTap", () => {
    const run = vi.fn(() => true);
    const setImage = vi.fn(() => ({ run }));
    const focus = vi.fn(() => ({ setImage }));
    const editor = { chain: () => ({ focus }) };

    expect(
      insertLetterImage(
        editor as never,
        "/api/letter-assets/33333333-3333-4333-8333-333333333333",
      ),
    ).toBe(true);
    expect(setImage).toHaveBeenCalledWith({
      src: "/api/letter-assets/33333333-3333-4333-8333-333333333333",
      alt: "信中图片",
      layout: "wide",
    });
  });
});
