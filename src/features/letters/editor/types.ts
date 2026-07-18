export type EditorStep =
  | "entry"
  | "schedule"
  | "mood"
  | "meal"
  | "health"
  | "salutation"
  | "compose"
  | "finalLine"
  | "sent";

export type LetterKind = "daily" | "time_capsule";

export type CompleteDailyAnswers = {
  mood: number;
  meal: number;
  health: number;
};

type EditorStateBase = {
  today: string;
  error?: string;
};

type DailyJourney = {
  kind: "daily";
  answers: CompleteDailyAnswers;
  scheduledFor?: never;
};

type TimeCapsuleJourney = {
  kind: "time_capsule";
  scheduledFor: string;
  answers?: never;
};

type Journey = DailyJourney | TimeCapsuleJourney;

type SalutationState = Journey & {
  step: "salutation";
  salutation: string;
};

type ComposeState = Journey & {
  step: "compose";
  salutation: string;
};

type FinalLineState = Journey & {
  step: "finalLine" | "sent";
  salutation: string;
  finalLine: string;
};

export type EditorState = EditorStateBase &
  (
    | { step: "entry"; kind: null }
    | { step: "schedule"; kind: "time_capsule" }
    | { step: "mood"; kind: "daily"; answers?: never }
    | { step: "meal"; kind: "daily"; answers: Pick<CompleteDailyAnswers, "mood"> }
    | {
        step: "health";
        kind: "daily";
        answers: Pick<CompleteDailyAnswers, "mood" | "meal">;
      }
    | SalutationState
    | ComposeState
    | FinalLineState
  );

export type EditorEvent =
  | { type: "CHOOSE_DAILY" }
  | { type: "CHOOSE_TIME_CAPSULE" }
  | { type: "SET_SCHEDULE"; value: string }
  | { type: "ANSWER"; value: number }
  | { type: "SET_SALUTATION"; value: string }
  | { type: "OPEN_COMPOSER" }
  | { type: "FINISH_COMPOSE" }
  | { type: "SET_FINAL_LINE"; value: string }
  | { type: "SEND" };
