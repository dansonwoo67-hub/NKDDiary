import { getShanghaiDate } from "../lifecycle";
import { countCharacters } from "@/lib/validation/text-limits";
import type { EditorEvent, EditorState } from "./types";

export const FINAL_LINE_LABEL = "总而言之，我想跟你说";

const INVALID_STEP_MESSAGE = "当前步骤不能进行这个操作";
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function initialEditorState(today: string): EditorState {
  if (!isValidIsoDate(today)) {
    throw new Error("today must be a valid YYYY-MM-DD date");
  }

  return {
    step: "entry",
    kind: null,
    today,
  };
}

export function reduceEditorState(
  state: EditorState,
  event: EditorEvent,
): EditorState {
  switch (event.type) {
    case "CHOOSE_DAILY":
      if (state.step !== "entry") return invalidStep(state);
      return {
        step: "mood",
        kind: "daily",
        today: state.today,
      };

    case "CHOOSE_TIME_CAPSULE":
      if (state.step !== "entry") return invalidStep(state);
      return {
        step: "schedule",
        kind: "time_capsule",
        today: state.today,
      };

    case "SET_SCHEDULE":
      if (state.step !== "schedule") return invalidStep(state);
      if (!isFutureSchedule(event.value, state.today)) {
        return withError(state, "请选择今天之后的有效日期和时间");
      }
      return {
        step: "salutation",
        kind: "time_capsule",
        today: state.today,
        scheduledFor: event.value,
        salutation: "",
      };

    case "ANSWER":
      if (!isQuestionState(state)) return invalidStep(state);
      if (!Number.isInteger(event.value) || event.value < 1 || event.value > 5) {
        return withError(state, "请选择 1 到 5 之间的答案");
      }
      return answerQuestion(state, event.value);

    case "SET_SALUTATION":
      if (state.step !== "salutation") return invalidStep(state);
      return {
        ...state,
        salutation: event.value,
        error: undefined,
      };

    case "OPEN_COMPOSER":
      if (state.step !== "salutation") return invalidStep(state);
      if (!hasLengthBetween(state.salutation, 1, 7)) {
        return withError(state, "称呼需要填写 1–7 个字");
      }
      return {
        ...state,
        step: "compose",
        salutation: state.salutation.trim(),
        error: undefined,
      };

    case "FINISH_COMPOSE":
      if (state.step !== "compose") return invalidStep(state);
      return {
        ...state,
        step: "finalLine",
        finalLine: "",
        error: undefined,
      };

    case "SET_FINAL_LINE":
      if (state.step !== "finalLine") return invalidStep(state);
      return {
        ...state,
        finalLine: event.value,
        error: undefined,
      };

    case "SEND":
      if (state.step !== "finalLine") return invalidStep(state);
      if (!hasLengthBetween(state.finalLine, 1, 7)) {
        return withError(
          state,
          `${FINAL_LINE_LABEL}需要填写 1–7 个字`,
        );
      }
      return {
        ...state,
        step: "sent",
        finalLine: state.finalLine.trim(),
        error: undefined,
      };

    default:
      return assertNever(event);
  }
}

function answerQuestion(
  state: Extract<EditorState, { step: "mood" | "meal" | "health" }>,
  value: number,
): EditorState {
  switch (state.step) {
    case "mood":
      return {
        ...state,
        step: "meal",
        answers: { mood: value },
        error: undefined,
      };
    case "meal":
      return {
        ...state,
        step: "health",
        answers: { ...state.answers, meal: value },
        error: undefined,
      };
    case "health":
      return {
        step: "salutation",
        kind: "daily",
        today: state.today,
        answers: { ...state.answers, health: value },
        salutation: "",
      };
    default:
      return assertNever(state);
  }
}

function isQuestionState(
  state: EditorState,
): state is Extract<EditorState, { step: "mood" | "meal" | "health" }> {
  return (
    state.step === "mood" || state.step === "meal" || state.step === "health"
  );
}

function isFutureSchedule(value: string, today: string): boolean {
  const match = ISO_DATE_TIME_PATTERN.exec(value);
  if (!match || !isValidIsoDate(match[1])) return false;
  const shanghaiDate = getShanghaiDate(value);
  return shanghaiDate !== null && shanghaiDate > today;
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function hasLengthBetween(value: string, min: number, max: number): boolean {
  const length = countCharacters(value);
  return length >= min && length <= max;
}

function invalidStep<T extends EditorState>(state: T): T {
  return withError(state, INVALID_STEP_MESSAGE);
}

function withError<T extends EditorState>(state: T, error: string): T {
  return { ...state, error };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled editor transition: ${JSON.stringify(value)}`);
}

export type { EditorEvent, EditorState, LetterKind } from "./types";
export { getShanghaiDate } from "../lifecycle";
