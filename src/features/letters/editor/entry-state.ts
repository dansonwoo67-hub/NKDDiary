import type { EditorState } from "./types";

export type ResumableEditorState =
  | Extract<EditorState, { step: "entry" }>
  | Extract<EditorState, { step: "schedule" }>
  | Extract<EditorState, { step: "mood" }>
  | Extract<EditorState, { step: "meal" }>
  | Extract<EditorState, { step: "health" }>
  | Extract<EditorState, { step: "salutation" }>
  | Extract<EditorState, { step: "compose" }>;

export type DraftResumeMetadata = {
  id: string;
  version: number;
  letterDate: string;
  kind: "daily" | "time_capsule";
  status: "draft";
  salutation: string;
  bodyJson: Record<string, unknown>;
  bodyText: string;
  finalLine: string;
  scheduledFor: string | null;
  sliders: {
    mood: number | null;
    meal: number | null;
    health: number | null;
  } | null;
};

export type InitialLetterDraft = {
  state: ResumableEditorState;
  metadata: DraftResumeMetadata;
};

export type LetterWritingEntry =
  | { availability: "new"; today: string; initialDraft: null }
  | { availability: "draft"; today: string; initialDraft: InitialLetterDraft }
  | {
      availability: "published";
      today: string;
      letterId: string;
      href: string;
    }
  | { availability: "withdrawn"; today: string; letterId: string }
  | { availability: "unavailable"; today: string; letterId: string };
