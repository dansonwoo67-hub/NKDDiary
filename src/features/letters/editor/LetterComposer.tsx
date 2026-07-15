"use client";

import type { Editor } from "@tiptap/react";
import { useMemo, useRef, useState } from "react";

import {
  getOwnLetterSnapshotAction,
  publishDailyLetterAction,
  saveDraftAction,
  scheduleLetterAction,
  type LetterMutationResult,
  type LetterTransitionInput,
  type OwnLetterSnapshotResult,
  type ScheduleLetterInput,
} from "@/features/letters/actions";
import type { LetterRecord } from "@/features/letters/mutations";
import type { RichLetterDocument } from "./block-ids";
import type { DraftResumeMetadata } from "./entry-state";
import type { ComposeEditorState } from "./LetterEntryModal";
import { ImageUploadButton } from "./ImageUploadButton";
import { FinalLineStep, validateFinalLine } from "./FinalLineStep";
import { LetterPaperWindow } from "./LetterPaperWindow";
import { PublishConfirmation } from "./PublishConfirmation";
import { RichLetterEditor } from "./RichLetterEditor";
import {
  useDraftAutosave,
  type AutosaveDraft,
  type AutosaveSaveResult,
} from "./useDraftAutosave";

const EMPTY_DOCUMENT: RichLetterDocument = { type: "doc", content: [] };

export function insertLetterImage(editor: Editor | null, src: string) {
  if (!editor) return false;
  const imageAttributes = { src, alt: "信中图片", layout: "wide" };
  return editor
    .chain()
    .focus()
    .setImage(imageAttributes)
    .run();
}

function shanghaiDate(isoDateTime: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDateTime));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function buildComposerDraft(
  state: ComposeEditorState,
  metadata: DraftResumeMetadata | null,
): AutosaveDraft {
  if (metadata) {
    return {
      id: metadata.id,
      version: metadata.version,
      kind: metadata.kind,
      letterDate: metadata.letterDate,
      salutation: metadata.salutation || state.salutation,
      bodyJson: metadata.bodyJson,
      bodyText: metadata.bodyText,
      finalLine: metadata.finalLine,
      scheduledFor: metadata.scheduledFor ?? undefined,
      sliders:
        metadata.kind === "daily"
          ? {
              selfMoodValue: metadata.sliders?.mood ?? 3,
              mealValue: metadata.sliders?.meal ?? 3,
              healthValue: metadata.sliders?.health ?? 3,
            }
          : null,
    };
  }

  if (state.kind === "time_capsule") {
    return {
      version: 0,
      kind: "time_capsule",
      letterDate: shanghaiDate(state.scheduledFor),
      scheduledFor: state.scheduledFor,
      salutation: state.salutation,
      bodyJson: EMPTY_DOCUMENT,
      bodyText: "",
      finalLine: "",
      sliders: null,
    };
  }

  return {
    version: 0,
    kind: "daily",
    letterDate: state.today,
    salutation: state.salutation,
    bodyJson: EMPTY_DOCUMENT,
    bodyText: "",
    finalLine: "",
    sliders: {
      selfMoodValue: state.answers.mood,
      mealValue: state.answers.meal,
      healthValue: state.answers.health,
    },
  };
}

async function persistDraft(input: AutosaveDraft): Promise<AutosaveSaveResult> {
  const result = await saveDraftAction({
    id: input.id,
    version: input.version,
    kind: input.kind,
    letterDate: input.letterDate,
    salutation: input.salutation,
    bodyJson: input.bodyJson,
    bodyText: input.bodyText,
    sevenCharLine: input.finalLine,
    sliders: input.sliders,
    scheduledFor: input.scheduledFor,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    id: result.letter?.id,
    version: result.letter?.version,
  };
}

export function letterRecordToAutosaveDraft(letter: LetterRecord): AutosaveDraft {
  return {
    id: letter.id,
    version: letter.version,
    kind: letter.kind,
    letterDate: letter.letterDate,
    salutation: letter.salutation ?? "",
    bodyJson: letter.bodyJson ?? EMPTY_DOCUMENT,
    bodyText: letter.bodyText ?? "",
    finalLine: letter.sevenCharLine ?? "",
    scheduledFor: letter.scheduledFor ?? undefined,
    sliders: letter.sliders,
  };
}

export function LetterComposer({
  state,
  metadata,
  recoveryOwnerId,
  onClose,
  saveDraft = persistDraft,
  loadLatest = getOwnLetterSnapshotAction,
  publishDaily = publishDailyLetterAction,
  scheduleLetter = scheduleLetterAction,
  onTransitionSuccess = () => window.location.assign("/"),
  autosaveDelayMs,
}: {
  state: ComposeEditorState;
  metadata: DraftResumeMetadata | null;
  recoveryOwnerId: string;
  onClose: () => void;
  saveDraft?: (draft: AutosaveDraft) => Promise<AutosaveSaveResult>;
  loadLatest?: (id: string) => Promise<OwnLetterSnapshotResult>;
  publishDaily?: (input: LetterTransitionInput) => Promise<LetterMutationResult>;
  scheduleLetter?: (input: ScheduleLetterInput) => Promise<LetterMutationResult>;
  onTransitionSuccess?: () => void;
  autosaveDelayMs?: number;
}) {
  const initialDraft = useMemo(() => buildComposerDraft(state, metadata), [metadata, state]);
  const recoveryIdentity = `${recoveryOwnerId}:${initialDraft.kind}:${initialDraft.letterDate}:${initialDraft.scheduledFor ?? "now"}`;
  const autosave = useDraftAutosave({
    initialDraft,
    recoveryIdentity,
    save: saveDraft,
    saveInitial: !metadata,
    delayMs: autosaveDelayMs,
  });
  const [keepLocalNotice, setKeepLocalNotice] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [finalLineError, setFinalLineError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const submissionRef = useRef(false);

  async function resolveFromServer(strategy: "use-server" | "keep-local") {
    const id = autosave.draft.id;
    if (!id) {
      setResolutionError("这封本机草稿还没有云端编号，请先继续保留本机版本。");
      return;
    }
    setResolvingConflict(true);
    setResolutionError(null);
    const result = await loadLatest(id);
    if (!result.ok) {
      setResolutionError(result.message);
      setResolvingConflict(false);
      return;
    }
    if (result.letter.status !== "draft") {
      setResolutionError("这封信已经不再是草稿，不能覆盖云端内容。");
      setResolvingConflict(false);
      return;
    }

    if (strategy === "use-server") {
      autosave.resolveConflict({
        strategy: "use-server",
        draft: letterRecordToAutosaveDraft(result.letter),
      });
      setKeepLocalNotice(false);
    } else {
      autosave.resolveConflict({
        strategy: "keep-local",
        serverId: result.letter.id,
        serverVersion: result.letter.version,
      });
      const outcome = await autosave.flush();
      if (outcome.state !== "saved" && outcome.state !== "idle") {
        setResolutionError(outcome.failure?.message ?? "本机版本暂时无法重新保存");
      } else {
        setKeepLocalNotice(true);
      }
    }
    setResolvingConflict(false);
  }

  const deliveryNeedsReselection =
    autosave.draft.kind === "time_capsule" &&
    (!autosave.draft.scheduledFor ||
      !Number.isFinite(Date.parse(autosave.draft.scheduledFor)) ||
      shanghaiDate(autosave.draft.scheduledFor) <= state.today);

  function updateFinalLine(value: string) {
    setFinalLineError(null);
    setTransitionError(null);
    autosave.update({ ...autosave.draft, finalLine: value });
  }

  function requestTransition() {
    const error = validateFinalLine(autosave.draft.finalLine);
    if (error) {
      setFinalLineError(error);
      return;
    }
    if (deliveryNeedsReselection) {
      setTransitionError("原定送达时间已经过去，请重新选择未来时间后再放进时间胶囊。");
      return;
    }
    setTransitionError(null);
    setConfirmationOpen(true);
  }

  async function confirmTransition() {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);
    setTransitionError(null);

    try {
      const outcome = await autosave.flush();
      if (outcome.state !== "saved" && outcome.state !== "idle") {
        setConfirmationOpen(false);
        setTransitionError(
          outcome.failure?.message ??
            (outcome.state === "conflict"
              ? "这封信在另一处有更新，请先处理版本冲突。"
              : "草稿还没有安全保存，请检查网络后再试。"),
        );
        return;
      }

      const latest = outcome.draft;
      if (!latest) {
        setConfirmationOpen(false);
        setTransitionError("无法确认刚刚保存的草稿版本，请稍后再试。");
        return;
      }
      const validationError = validateFinalLine(latest.finalLine);
      if (validationError) {
        setConfirmationOpen(false);
        setFinalLineError(validationError);
        return;
      }
      if (!latest.id || latest.version < 1) {
        setConfirmationOpen(false);
        setTransitionError("草稿还没有取得云端编号，请稍后再试。");
        return;
      }

      let result: LetterMutationResult;
      if (latest.kind === "daily") {
        result = await publishDaily({ id: latest.id, version: latest.version });
      } else {
        const scheduledFor = latest.scheduledFor;
        if (
          !scheduledFor ||
          !Number.isFinite(Date.parse(scheduledFor)) ||
          shanghaiDate(scheduledFor) <= shanghaiDate(new Date().toISOString())
        ) {
          setConfirmationOpen(false);
          setTransitionError("原定送达时间已经过去，请重新选择未来时间后再放进时间胶囊。");
          return;
        }
        result = await scheduleLetter({
          id: latest.id,
          version: latest.version,
          kind: "time_capsule",
          letterDate: latest.letterDate,
          salutation: latest.salutation,
          bodyJson: latest.bodyJson,
          bodyText: latest.bodyText,
          sevenCharLine: latest.finalLine.trim(),
          sliders: null,
          scheduledFor,
        });
      }

      if (!result.ok) {
        setConfirmationOpen(false);
        setTransitionError(result.message);
        return;
      }

      setLocked(true);
      setConfirmationOpen(false);
      onClose();
      onTransitionSuccess();
    } catch (error) {
      setConfirmationOpen(false);
      setTransitionError(error instanceof Error ? error.message : "暂时寄不出去，请稍后再试。");
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <LetterPaperWindow
      state={autosave.state}
      recoverySafe={autosave.recoverySafe}
      failure={autosave.failure}
      flush={autosave.flush}
      onClose={onClose}
      title={`写给${autosave.draft.salutation}的信`}
    >
      <div className="mx-auto w-full max-w-[48rem]">
        <h2 className="sr-only">信纸已经铺好了</h2>
        <div className="mb-4 px-2 sm:px-4">
          <p className="text-sm tracking-[0.16em] text-[var(--muted-ink)]">
            {autosave.draft.letterDate}
          </p>
          <p className="mt-2 text-xl font-semibold text-[var(--ink)]">
            {autosave.draft.salutation}：
          </p>
        </div>

        {keepLocalNotice && autosave.state !== "conflict" ? (
          <p role="status" className="mb-4 rounded-[1.25rem] bg-[#edf6e8] px-4 py-3 text-sm text-[var(--ink)]">
            本机版本已按云端最新版本重新保存。
          </p>
        ) : null}

        {autosave.state === "conflict" ? (
          <div className="mb-4 rounded-[1.25rem] border border-[#d6a657]/35 bg-[#fff3d9] p-4 text-sm leading-6 text-[var(--ink)]">
            <p>
              {autosave.recoverySafe
                ? "这封信在另一个页面被修改过。本机版本已安全保留，不会自动覆盖。"
                : "这封信在另一个页面被修改过。本机也未能保存，请勿刷新或关闭。"}
            </p>
            {keepLocalNotice ? (
              <p className="mt-2 font-medium">本机版本已按云端最新版本重新保存。</p>
            ) : null}
            {resolutionError ? <p role="alert" className="mt-2 font-medium">{resolutionError}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={resolvingConflict}
                onClick={() => void resolveFromServer("use-server")}
                className="min-h-10 rounded-full bg-[var(--rose)] px-4 font-semibold text-[#3f2928] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                重新载入云端版本
              </button>
              <button
                type="button"
                disabled={resolvingConflict}
                onClick={() => void resolveFromServer("keep-local")}
                className="min-h-10 rounded-full border border-[rgb(71_56_45_/_16%)] bg-white/70 px-4 font-medium focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                继续保留本机版本
              </button>
            </div>
          </div>
        ) : null}

        {deliveryNeedsReselection ? (
          <p role="alert" className="mb-4 rounded-[1.25rem] bg-[#fff3d9] px-4 py-3 text-sm text-[var(--ink)]">
            原定送达时间已经过去，请在寄出前重新选择未来时间。
          </p>
        ) : null}

        <RichLetterEditor
          value={autosave.draft.bodyJson as RichLetterDocument}
          onReady={setEditor}
          imageUploadControl={
            <ImageUploadButton
              letterId={autosave.draft.id}
              onUploaded={(src) => insertLetterImage(editor, src)}
            />
          }
          onChange={({ json, text }) =>
            autosave.update({
              ...autosave.draft,
              bodyJson: json,
              bodyText: text,
            })
          }
        />

        {transitionError ? (
          <p role="alert" className="mx-2 mt-5 rounded-[1.25rem] bg-[#fff3d9] px-4 py-3 text-sm font-medium text-[#7b3037] sm:mx-4">
            {transitionError}
          </p>
        ) : null}

        <FinalLineStep
          value={autosave.draft.finalLine}
          kind={autosave.draft.kind}
          error={finalLineError}
          disabled={locked || submitting}
          onChange={updateFinalLine}
          onContinue={requestTransition}
        />
      </div>

      {confirmationOpen ? (
        <PublishConfirmation
          kind={autosave.draft.kind}
          scheduledFor={autosave.draft.scheduledFor}
          busy={submitting}
          onCancel={() => setConfirmationOpen(false)}
          onConfirm={() => void confirmTransition()}
        />
      ) : null}
    </LetterPaperWindow>
  );
}
