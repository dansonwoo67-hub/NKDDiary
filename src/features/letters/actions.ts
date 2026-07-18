"use server";

import {
  createOpenResponseAction as createOpenResponseMutation,
  getOwnLetterSnapshotAction as getOwnLetterSnapshotMutation,
  deletePrivateLetterAction as deletePrivateLetterMutation,
  publishDailyLetterAction as publishDailyLetterMutation,
  returnScheduledToDraftAction as returnScheduledToDraftMutation,
  saveDraftAction as saveDraftMutation,
  saveLetterAction as saveLetterMutation,
  scheduleLetterAction as scheduleLetterMutation,
  withdrawPublishedLetterAction as withdrawPublishedLetterMutation,
  type DraftInput,
  type LetterMutationResult,
  type OwnLetterSnapshotResult,
  type LetterTransitionInput,
  type SaveLetterInput,
  type ScheduleLetterInput,
} from "./mutations";
import {
  getLettersForDate as queryLettersForDate,
  getTodayLetterForEditor as queryTodayLetterForEditor,
  type EditorLetterState,
  type LetterDayView,
} from "./queries";

// Temporary compatibility module for the current pages. These wrappers keep a
// real Server Action boundary while reads and lifecycle writes remain split.
export async function saveDraftAction(input: DraftInput): Promise<LetterMutationResult> {
  return saveDraftMutation(input);
}

export async function getOwnLetterSnapshotAction(id: string): Promise<OwnLetterSnapshotResult> {
  return getOwnLetterSnapshotMutation(id);
}

export async function scheduleLetterAction(input: ScheduleLetterInput): Promise<LetterMutationResult> {
  return scheduleLetterMutation(input);
}

export async function publishDailyLetterAction(input: LetterTransitionInput): Promise<LetterMutationResult> {
  return publishDailyLetterMutation(input);
}

export async function returnScheduledToDraftAction(input: LetterTransitionInput): Promise<LetterMutationResult> {
  return returnScheduledToDraftMutation(input);
}

export async function deletePrivateLetterAction(input: LetterTransitionInput): Promise<LetterMutationResult> {
  return deletePrivateLetterMutation(input);
}

export async function withdrawPublishedLetterAction(input: LetterTransitionInput): Promise<LetterMutationResult> {
  return withdrawPublishedLetterMutation(input);
}

export async function saveLetterAction(input: SaveLetterInput) {
  return saveLetterMutation(input);
}

export async function createOpenResponseAction(input: { letterId: string; responseText: string }) {
  return createOpenResponseMutation(input);
}

export async function getTodayLetterForEditor(): Promise<EditorLetterState> {
  return queryTodayLetterForEditor();
}

export async function getLettersForDate(date: string): Promise<LetterDayView> {
  return queryLettersForDate(date);
}

export type {
  DraftInput,
  LetterMutationResult,
  OwnLetterSnapshotResult,
  LetterTransitionInput,
  SaveLetterInput,
  ScheduleLetterInput,
} from "./mutations";
export type {
  EditorLetter,
  EditorLetterState,
  LetterAnnotation,
  LetterDayView,
  ReaderLetter,
} from "./queries";
