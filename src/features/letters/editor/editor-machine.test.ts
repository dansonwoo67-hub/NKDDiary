import { describe, expect, it } from "vitest";

import {
  FINAL_LINE_LABEL,
  getShanghaiDate,
  initialEditorState,
  reduceEditorState,
} from "./editor-machine";

describe("guided writing state machine", () => {
  it("routes daily letters through all three questions", () => {
    let state = initialEditorState("2026-07-13");

    state = reduceEditorState(state, { type: "CHOOSE_DAILY" });
    expect(state.step).toBe("mood");

    state = reduceEditorState(state, { type: "ANSWER", value: 4 });
    expect(state.step).toBe("meal");

    state = reduceEditorState(state, { type: "ANSWER", value: 3 });
    expect(state.step).toBe("health");

    state = reduceEditorState(state, { type: "ANSWER", value: 5 });
    expect(state.step).toBe("salutation");
    if (state.step !== "salutation" || state.kind !== "daily") {
      throw new Error("expected daily salutation state");
    }
    expect(state.answers).toEqual({ mood: 4, meal: 3, health: 5 });
  });

  it("routes future letters directly to salutation after scheduling", () => {
    let state = reduceEditorState(initialEditorState("2026-07-13"), {
      type: "CHOOSE_TIME_CAPSULE",
    });
    expect(state.step).toBe("schedule");

    state = reduceEditorState(state, {
      type: "SET_SCHEDULE",
      value: "2026-08-01T08:30:00+08:00",
    });

    expect(state.step).toBe("salutation");
    expect(state.kind).toBe("time_capsule");
    expect("answers" in state).toBe(false);
  });

  it("compares the scheduled instant using its Asia/Shanghai calendar date", () => {
    expect(getShanghaiDate("2026-07-14T00:30:00+14:00")).toBe("2026-07-13");
    expect(getShanghaiDate("2026-07-14T00:30:00+08:00")).toBe("2026-07-14");

    let state = reduceEditorState(initialEditorState("2026-07-13"), {
      type: "CHOOSE_TIME_CAPSULE",
    });
    state = reduceEditorState(state, {
      type: "SET_SCHEDULE",
      value: "2026-07-14T00:30:00+14:00",
    });
    expect(state.step).toBe("schedule");

    state = reduceEditorState(state, {
      type: "SET_SCHEDULE",
      value: "2026-07-14T00:30:00+08:00",
    });
    expect(state.step).toBe("salutation");
  });

  it.each([
    "2026-07-12T23:59:00+08:00",
    "2026-07-13T23:59:00+08:00",
    "not-a-date",
  ])("rejects non-future schedule %s", (value) => {
    let state = reduceEditorState(initialEditorState("2026-07-13"), {
      type: "CHOOSE_TIME_CAPSULE",
    });

    state = reduceEditorState(state, { type: "SET_SCHEDULE", value });

    expect(state.step).toBe("schedule");
    expect(state.error).toBeTruthy();
  });

  it.each(["", "        ", "亲爱的老婆大人呀"])(
    "does not open the composer with invalid salutation %j",
    (value) => {
      let state = reduceEditorState(initialEditorState("2026-07-13"), {
        type: "CHOOSE_DAILY",
      });
      state = reduceEditorState(state, { type: "ANSWER", value: 4 });
      state = reduceEditorState(state, { type: "ANSWER", value: 3 });
      state = reduceEditorState(state, { type: "ANSWER", value: 5 });
      state = reduceEditorState(state, { type: "SET_SALUTATION", value });
      state = reduceEditorState(state, { type: "OPEN_COMPOSER" });

      expect(state.step).toBe("salutation");
      expect(state.error).toBeTruthy();
    },
  );

  it("opens the composer after a valid 1-7 character salutation", () => {
    let state = reduceEditorState(initialEditorState("2026-07-13"), {
      type: "CHOOSE_TIME_CAPSULE",
    });
    state = reduceEditorState(state, {
      type: "SET_SCHEDULE",
      value: "2026-08-01T08:30:00+08:00",
    });
    state = reduceEditorState(state, {
      type: "SET_SALUTATION",
      value: "亲爱的老婆",
    });
    state = reduceEditorState(state, { type: "OPEN_COMPOSER" });

    expect(state.step).toBe("compose");
    if (state.step !== "compose") throw new Error("expected compose state");
    expect(state.salutation).toBe("亲爱的老婆");
  });

  it("requires the final line after the body and limits it to 1-7 characters", () => {
    let state = reduceEditorState(initialEditorState("2026-07-13"), {
      type: "CHOOSE_TIME_CAPSULE",
    });
    state = reduceEditorState(state, {
      type: "SET_SCHEDULE",
      value: "2026-08-01T08:30:00+08:00",
    });
    state = reduceEditorState(state, { type: "SET_SALUTATION", value: "老婆" });
    state = reduceEditorState(state, { type: "OPEN_COMPOSER" });
    state = reduceEditorState(state, { type: "FINISH_COMPOSE" });
    expect(state.step).toBe("finalLine");

    state = reduceEditorState(state, {
      type: "SET_FINAL_LINE",
      value: "平安到家好不好呀",
    });
    state = reduceEditorState(state, { type: "SEND" });
    expect(state.step).toBe("finalLine");
    expect(state.error).toBeTruthy();

    state = reduceEditorState(state, { type: "SET_FINAL_LINE", value: "平安到家" });
    state = reduceEditorState(state, { type: "SEND" });
    expect(state.step).toBe("sent");
  });

  it("keeps the current step safe when an event tries to skip ahead", () => {
    const state = reduceEditorState(initialEditorState("2026-07-13"), {
      type: "OPEN_COMPOSER",
    });

    expect(state.step).toBe("entry");
    expect(state.error).toBe("当前步骤不能进行这个操作");
  });

  it("preserves all state data after an invalid event and allows correction", () => {
    let state = reduceEditorState(initialEditorState("2026-07-13"), {
      type: "CHOOSE_TIME_CAPSULE",
    });
    state = reduceEditorState(state, {
      type: "SET_SCHEDULE",
      value: "2026-08-01T08:30:00+08:00",
    });
    state = reduceEditorState(state, { type: "SET_SALUTATION", value: "亲爱的老婆" });
    const beforeInvalidEvent = state;

    state = reduceEditorState(state, { type: "SEND" });
    expect(state).toEqual({ ...beforeInvalidEvent, error: expect.any(String) });
    expect(state.error).toBeTruthy();

    state = reduceEditorState(state, { type: "OPEN_COMPOSER" });
    expect(state.step).toBe("compose");
    expect(state.error).toBeUndefined();
  });

  it("uses the approved final-line label exactly", () => {
    expect(FINAL_LINE_LABEL).toBe("总而言之，我想跟你说");
  });

  it.each([
    ["😀😀😀😀😀😀😀", true],
    ["😀😀😀😀😀😀😀😀", false],
  ])("counts salutation Unicode code points consistently: %s", (value, accepted) => {
    let state = reduceEditorState(initialEditorState("2026-07-13"), {
      type: "CHOOSE_TIME_CAPSULE",
    });
    state = reduceEditorState(state, {
      type: "SET_SCHEDULE",
      value: "2026-08-01T08:30:00+08:00",
    });
    state = reduceEditorState(state, { type: "SET_SALUTATION", value });
    state = reduceEditorState(state, { type: "OPEN_COMPOSER" });

    expect(state.step).toBe(accepted ? "compose" : "salutation");
  });
});
