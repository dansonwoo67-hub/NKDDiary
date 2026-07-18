"use client";

import { Expand, Minimize2, Save, Shrink, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type {
  AutosaveFailure,
  AutosaveFlushOutcome,
  AutosaveState,
} from "./useDraftAutosave";

export type LetterPaperMode = "normal" | "minimized" | "fullscreen";

const STATUS_COPY: Record<AutosaveState, string> = {
  idle: "等待保存",
  saving: "正在保存…",
  saved: "已保存",
  offline: "已保存在本机",
  conflict: "发现其他修改，请选择恢复方式",
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "a[href]",
  '[contenteditable="true"]:not([tabindex="-1"]):not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function autosaveStatusCopy(
  state: AutosaveState,
  recoverySafe: boolean,
  failure: AutosaveFailure | null,
) {
  if (state !== "offline") return STATUS_COPY[state];
  if (!recoverySafe) return "保存失败，请勿关闭";
  if (failure?.kind === "validation" || failure?.kind === "locked") {
    return "服务器未接受，已保存在本机";
  }
  return "已保存在本机";
}

export function LetterPaperWindow({
  children,
  state,
  recoverySafe,
  failure,
  flush,
  onClose,
  title = "写信信纸",
}: {
  children: ReactNode;
  state: AutosaveState;
  recoverySafe: boolean;
  failure: AutosaveFailure | null;
  flush: () => Promise<AutosaveFlushOutcome> | AutosaveFlushOutcome;
  onClose: () => void | Promise<void>;
  title?: string;
}) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [mode, setMode] = useState<LetterPaperMode>("normal");
  const [closing, setClosing] = useState(false);
  const [closeWarning, setCloseWarning] = useState<"local-safe" | "unsafe" | null>(null);
  const previousModeRef = useRef<Exclude<LetterPaperMode, "fullscreen">>("normal");
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const statusCopy = autosaveStatusCopy(state, recoverySafe, failure);

  useEffect(() => {
    if (mode === "minimized") {
      continueButtonRef.current?.focus();
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMode(mode === "fullscreen" ? previousModeRef.current : "minimized");
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true",
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panelRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === panelRef.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mode]);

  async function close() {
    if (closing) return;
    setClosing(true);
    let outcome: AutosaveFlushOutcome;
    try {
      outcome = await flush();
    } catch {
      outcome = {
        state: "offline",
        recoverySafe,
        failure: { kind: "unknown", message: "保存请求失败" },
      };
    }
    setClosing(false);
    if (outcome.state === "offline" || outcome.state === "conflict") {
      setCloseWarning(outcome.recoverySafe ? "local-safe" : "unsafe");
      return;
    }
    await onClose();
  }

  async function retrySave() {
    const outcome = await flush();
    if (outcome.state === "saved") {
      setCloseWarning(null);
    } else {
      setCloseWarning(outcome.recoverySafe ? "local-safe" : "unsafe");
    }
  }

  function enterFullscreen() {
    previousModeRef.current = mode === "minimized" ? "minimized" : "normal";
    setMode("fullscreen");
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        hidden={mode === "minimized"}
        className={
          mode === "minimized"
            ? "hidden"
            : "fixed inset-0 z-[70] grid min-h-[100dvh] place-items-center overflow-y-auto bg-[rgb(57_42_33_/_42%)] p-2 backdrop-blur-[4px] sm:p-6"
        }
      >
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-mode={mode}
          tabIndex={-1}
          className={
            mode === "fullscreen"
              ? "flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--paper)] outline-none"
              : "my-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-[58rem] flex-col overflow-hidden rounded-[1.75rem] border border-white/70 bg-[var(--paper)] shadow-[0_30px_100px_rgb(57_42_33_/_28%)] outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2.25rem]"
          }
        >
          <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-[rgb(71_56_45_/_10%)] bg-[rgb(255_248_234_/_92%)] px-4 sm:px-6">
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--ink)]">{title}</p>
              <p
                aria-live="polite"
                className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted-ink)]"
              >
                {state === "offline" ? (
                  <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <Save aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {statusCopy}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="最小化写信窗口"
                onClick={() => setMode("minimized")}
                className="grid h-11 w-11 place-items-center rounded-full text-[var(--muted-ink)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none"
              >
                <Minimize2 aria-hidden="true" className="h-5 w-5" />
              </button>
              {mode === "fullscreen" ? (
                <button
                  type="button"
                  aria-label="退出全屏"
                  onClick={() => setMode(previousModeRef.current)}
                  className="grid h-11 w-11 place-items-center rounded-full text-[var(--muted-ink)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none"
                >
                  <Shrink aria-hidden="true" className="h-5 w-5" />
                </button>
              ) : (
                <button
                  ref={fullscreenButtonRef}
                  type="button"
                  aria-label="全屏写信"
                  onClick={enterFullscreen}
                  className="grid h-11 w-11 place-items-center rounded-full text-[var(--muted-ink)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none"
                >
                  <Expand aria-hidden="true" className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                aria-label="关闭写信窗口"
                disabled={closing}
                onClick={() => void close()}
                className="grid h-11 w-11 place-items-center rounded-full text-[var(--ink)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50 motion-reduce:transition-none"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          </header>

          {closeWarning ? (
            <div
              role="alert"
              className="flex flex-col gap-3 border-b border-[#d6a657]/30 bg-[#fff3d9] px-5 py-4 text-sm text-[var(--ink)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">
                  {closeWarning === "local-safe"
                    ? "这次修改已保存在本机，联网后可继续。"
                    : "保存失败，请勿关闭"}
                </p>
                {failure ? (
                  <p className="mt-1 text-[var(--muted-ink)]">{failure.message}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setCloseWarning(null)}
                  className="min-h-10 rounded-full border border-[rgb(71_56_45_/_16%)] bg-white/70 px-4 font-medium focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  继续编辑
                </button>
                {closeWarning === "local-safe" ? (
                  <button
                    type="button"
                    aria-label="仍要关闭"
                    onClick={() => void onClose()}
                    className="min-h-10 rounded-full bg-[var(--rose)] px-4 font-semibold text-[#3f2928] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    仍要关闭
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void retrySave()}
                    className="min-h-10 rounded-full bg-[var(--rose)] px-4 font-semibold text-[#3f2928] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    重试保存
                  </button>
                )}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">{children}</div>
        </section>
      </div>

      <div
        hidden={mode !== "minimized"}
        className={
          mode === "minimized"
            ? "fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-[1.25rem] border border-white/70 bg-[rgb(255_248_234_/_96%)] p-3 shadow-[0_20px_60px_rgb(57_42_33_/_25%)] backdrop-blur sm:bottom-5"
            : "hidden"
        }
      >
        <div className="min-w-0 pl-2">
          <p className="truncate font-semibold text-[var(--ink)]">信还在这里</p>
          <p className="text-xs text-[var(--muted-ink)]">{statusCopy}</p>
        </div>
        <button
          ref={continueButtonRef}
          type="button"
          aria-label="继续写信"
          onClick={() => setMode("normal")}
          className="min-h-11 shrink-0 rounded-full bg-[var(--rose)] px-5 font-semibold text-[#3f2928] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          继续写信
        </button>
      </div>
    </>,
    document.body,
  );
}
