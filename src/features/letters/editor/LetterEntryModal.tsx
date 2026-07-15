"use client";

import { Clock3, Heart, PenLine, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { initialEditorState, reduceEditorState } from "./editor-machine";
import { QuestionStep } from "./QuestionStep";
import { SalutationStep } from "./SalutationStep";
import { ScheduleStep } from "./ScheduleStep";
import { LetterComposer } from "./LetterComposer";
import type {
  DraftResumeMetadata,
  LetterWritingEntry,
} from "./entry-state";
import type { EditorState } from "./types";

export type ComposeEditorState = Extract<EditorState, { step: "compose" }>;

export type LetterEntryModalProps = {
  entry: LetterWritingEntry;
  initiallyOpen?: boolean;
  onCompose?: (
    state: ComposeEditorState,
    metadata: DraftResumeMetadata | null,
  ) => void;
  recoveryOwnerId?: string;
};

const STEP_LABELS: Record<EditorState["step"], string> = {
  entry: "选择写信方式",
  schedule: "选择送达时间",
  mood: "爱自己",
  meal: "爱生活",
  health: "爱健康",
  salutation: "填写称呼",
  compose: "写信正文",
  finalLine: "填写最后一句",
  sent: "已寄出",
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function LetterEntryModal({
  entry,
  initiallyOpen = false,
  onCompose,
  recoveryOwnerId = "local-user",
}: LetterEntryModalProps) {
  if (entry.availability === "published") {
    return (
      <Link
        href={entry.href}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[rgb(71_56_45_/_18%)] bg-white/70 px-6 py-3 font-semibold text-[var(--ink)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
      >
        <Heart aria-hidden="true" className="h-5 w-5 text-[var(--rose-ink)]" />
        查看今天的信
      </Link>
    );
  }

  if (
    entry.availability === "withdrawn" ||
    entry.availability === "unavailable"
  ) {
    const withdrawn = entry.availability === "withdrawn";
    return (
      <div className="text-left">
        <button
          type="button"
          disabled
          className="inline-flex min-h-12 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-[rgb(71_56_45_/_16%)] bg-white/55 px-6 py-3 font-semibold text-[var(--muted-ink)] opacity-80"
        >
          <PenLine aria-hidden="true" className="h-5 w-5" />
          {withdrawn ? "今天的信已撤回" : "今天的信暂不可编辑"}
        </button>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          {withdrawn
            ? "可在个人中心查看撤回记录"
            : "请在个人中心查看这封信"}
        </p>
      </div>
    );
  }

  return (
    <EditableLetterEntry
      entry={entry}
      initiallyOpen={initiallyOpen}
      onCompose={onCompose}
      recoveryOwnerId={recoveryOwnerId}
    />
  );
}

function EditableLetterEntry({
  entry,
  initiallyOpen,
  onCompose,
  recoveryOwnerId,
}: {
  entry: Extract<LetterWritingEntry, { availability: "new" | "draft" }>;
  initiallyOpen: boolean;
  onCompose?: LetterEntryModalProps["onCompose"];
  recoveryOwnerId: string;
}) {
  const initialState = () =>
    entry.availability === "draft"
      ? entry.initialDraft.state
      : initialEditorState(entry.today);
  const metadata =
    entry.availability === "draft" ? entry.initialDraft.metadata : null;
  const [open, setOpen] = useState(initiallyOpen);
  const [state, setState] = useState<EditorState>(initialState);
  const [questionValue, setQuestionValue] = useState(3);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const previousStepRef = useRef(state.step);
  const composeNotifiedRef = useRef(false);
  const dialogTitleId = useId();

  useEffect(() => {
    if (!open || state.step === "compose") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;
      const activeIndex = activeElement ? focusable.indexOf(activeElement) : -1;
      if (!activeElement || !dialogRef.current?.contains(activeElement) || activeIndex < 0) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, state.step]);

  useEffect(() => {
    if (!open) {
      previousStepRef.current = state.step;
      return;
    }
    if (previousStepRef.current !== state.step) {
      previousStepRef.current = state.step;
      stepRef.current?.focus();
    }
  }, [open, state.step]);

  useEffect(() => {
    if (!open) {
      composeNotifiedRef.current = false;
      return;
    }
    if (state.step === "compose" && !composeNotifiedRef.current) {
      composeNotifiedRef.current = true;
      onCompose?.(state, metadata);
    }
  }, [metadata, onCompose, open, state]);

  function openModal() {
    const next = initialState();
    previousStepRef.current = next.step;
    setState(next);
    setQuestionValue(3);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function transition(event: Parameters<typeof reduceEditorState>[1]) {
    setState((current) => reduceEditorState(current, event));
  }

  function answerQuestion() {
    setState((current) => {
      let next = reduceEditorState(current, {
        type: "ANSWER",
        value: questionValue,
      });
      if (
        next.step === "salutation" &&
        metadata?.salutation &&
        !next.salutation
      ) {
        next = reduceEditorState(next, {
          type: "SET_SALUTATION",
          value: metadata.salutation,
        });
      }
      return next;
    });
    setQuestionValue(3);
  }

  function openComposer() {
    const next = reduceEditorState(state, { type: "OPEN_COMPOSER" });
    setState(next);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openModal}
        className="group inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-[var(--rose)] px-6 py-3 font-semibold text-[#3f2928] shadow-[0_14px_36px_rgb(152_74_79_/_20%)] transition hover:-translate-y-0.5 hover:bg-[#df7c82] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] active:translate-y-0 motion-reduce:transform-none"
      >
        <PenLine aria-hidden="true" className="h-5 w-5 transition-transform group-hover:-rotate-6 motion-reduce:transform-none" />
        {entry.availability === "draft" ? "继续写今天的信" : "写一封信"}
      </button>

      {open && state.step === "compose" ? (
        <LetterComposer
          state={state}
          metadata={metadata}
          recoveryOwnerId={recoveryOwnerId}
          onClose={closeModal}
        />
      ) : null}

      {open && state.step !== "compose" ? (
        <div className="fixed inset-0 z-50 grid min-h-[100dvh] place-items-center overflow-y-auto bg-[rgb(57_42_33_/_36%)] p-3 backdrop-blur-[3px] sm:p-6">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="letter-modal-panel relative my-auto w-full max-w-[38rem] overflow-hidden rounded-[2rem] border border-white/70 bg-[var(--paper)] shadow-[0_30px_100px_rgb(57_42_33_/_28%)] sm:rounded-[2.5rem]"
          >
            <h2 id={dialogTitleId} className="sr-only">
              写信
            </h2>
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--rose)]" />
            <button
              ref={closeRef}
              type="button"
              aria-label="关闭写信窗口"
              onClick={closeModal}
              className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full border border-[rgb(71_56_45_/_12%)] bg-white/70 text-[var(--ink)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:right-6 sm:top-6"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>

            <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto px-5 pb-6 pt-20 sm:max-h-[min(46rem,calc(100dvh-3rem))] sm:px-10 sm:pb-10 sm:pt-20">
              <div
                ref={stepRef}
                data-testid="letter-step-focus"
                tabIndex={-1}
                aria-label={`写信步骤：${STEP_LABELS[state.step]}`}
                className="outline-none"
              >
              {state.step === "entry" ? (
                <div className="letter-step">
                  <p className="text-sm font-medium tracking-[0.18em] text-[var(--muted-ink)]">
                    {displayDate(entry.today)}
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold leading-tight text-[var(--ink)] sm:text-4xl">
                    想写一封怎样的信？
                  </h2>
                  <p className="mt-4 max-w-md text-sm leading-7 text-[var(--muted-ink)]">
                    写今天，从三个小问题开始。写给未来，则先约好它的送达时间。
                  </p>

                  <div className="mt-9 grid gap-3 sm:grid-cols-[1.12fr_0.88fr]">
                    <button
                      type="button"
                      aria-label="写今天的信"
                      onClick={() => transition({ type: "CHOOSE_DAILY" })}
                      className="group min-h-36 rounded-[1.75rem] border border-[rgb(71_56_45_/_12%)] bg-white/65 p-5 text-left transition hover:-translate-y-1 hover:border-[rgb(229_139_143_/_55%)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--focus-ring)] active:translate-y-0 motion-reduce:transform-none"
                    >
                      <Heart aria-hidden="true" className="h-7 w-7 fill-[rgb(229_139_143_/_22%)] text-[var(--rose)]" />
                      <span className="mt-5 block text-lg font-semibold text-[var(--ink)]">写今天的信</span>
                      <span className="mt-1 block text-sm leading-6 text-[var(--muted-ink)]">从今天的感受开始</span>
                    </button>
                    <button
                      type="button"
                      aria-label="写给未来"
                      onClick={() => transition({ type: "CHOOSE_TIME_CAPSULE" })}
                      className="group min-h-36 rounded-[1.75rem] border border-[rgb(71_56_45_/_12%)] bg-[#f6ead3] p-5 text-left transition hover:-translate-y-1 hover:border-[rgb(229_139_143_/_45%)] hover:bg-[#f8edda] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--focus-ring)] active:translate-y-0 motion-reduce:transform-none"
                    >
                      <Clock3 aria-hidden="true" className="h-7 w-7 text-[var(--muted-ink)]" />
                      <span className="mt-5 block text-lg font-semibold text-[var(--ink)]">写给未来</span>
                      <span className="mt-1 block text-sm leading-6 text-[var(--muted-ink)]">把想说的话交给时间</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {state.step === "schedule" ? (
                <ScheduleStep
                  today={state.today}
                  error={state.error}
                  onContinue={(value) => transition({ type: "SET_SCHEDULE", value })}
                />
              ) : null}

              {state.step === "mood" || state.step === "meal" || state.step === "health" ? (
                <QuestionStep
                  question={state.step}
                  value={questionValue}
                  onChange={setQuestionValue}
                  onContinue={answerQuestion}
                />
              ) : null}

              {state.step === "salutation" ? (
                <SalutationStep
                  value={state.salutation}
                  error={state.error}
                  onChange={(value) => transition({ type: "SET_SALUTATION", value })}
                  onContinue={openComposer}
                />
              ) : null}

              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
