import { describe, expect, it } from "vitest";

import type { EditorState } from "./types";

describe("EditorState type invariants", () => {
  it("makes invalid completed journeys impossible to construct", () => {
    const daily: EditorState = {
      step: "compose",
      kind: "daily",
      today: "2026-07-13",
      answers: { mood: 5, meal: 4, health: 3 },
      salutation: "亲爱的",
    };
    const timeCapsule: EditorState = {
      step: "compose",
      kind: "time_capsule",
      today: "2026-07-13",
      scheduledFor: "2026-08-01T08:30:00+08:00",
      salutation: "亲爱的",
    };
    const answeredMood: EditorState = {
      step: "mood",
      kind: "daily",
      today: "2026-07-13",
      // @ts-expect-error The first question state cannot already contain answers.
      answers: { mood: 5 },
    };

    const incompleteDaily: EditorState = {
      step: "compose",
      kind: "daily",
      today: "2026-07-13",
      // @ts-expect-error Daily post-question states require all three answers.
      answers: { mood: 5, meal: 4 },
      salutation: "亲爱的",
    };
    const scheduledDaily: EditorState = {
      step: "compose",
      kind: "daily",
      today: "2026-07-13",
      answers: { mood: 5, meal: 4, health: 3 },
      // @ts-expect-error Daily states cannot be scheduled.
      scheduledFor: "2026-08-01T08:30:00+08:00",
      salutation: "亲爱的",
    };
    // @ts-expect-error Time-capsule post-schedule states require scheduledFor.
    const unscheduledCapsule: EditorState = {
      step: "compose",
      kind: "time_capsule",
      today: "2026-07-13",
      salutation: "亲爱的",
    };
    const answeredCapsule: EditorState = {
      step: "compose",
      kind: "time_capsule",
      today: "2026-07-13",
      scheduledFor: "2026-08-01T08:30:00+08:00",
      // @ts-expect-error Time capsules do not carry daily answers.
      answers: { mood: 5, meal: 4, health: 3 },
      salutation: "亲爱的",
    };

    expect([daily, timeCapsule]).toHaveLength(2);
    void incompleteDaily;
    void scheduledDaily;
    void unscheduledCapsule;
    void answeredCapsule;
    void answeredMood;
  });
});
