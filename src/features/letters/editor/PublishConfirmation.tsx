"use client";

import { useEffect, useId, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function formatShanghaiDelivery(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "所选时间";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}年${Number(part("month"))}月${Number(part("day"))}日 ${part("hour")}:${part("minute")}`;
}

export function PublishConfirmation({
  kind,
  scheduledFor,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: "daily" | "time_capsule";
  scheduledFor?: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
    onCancelRef.current = onCancel;
  }, [busy, onCancel]);

  useEffect(() => {
    priorFocusRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      priorFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (busy) panelRef.current?.focus();
  }, [busy]);

  const capsule = kind === "time_capsule";
  return (
    <div className="fixed inset-0 z-[70] grid min-h-[100dvh] place-items-center overflow-y-auto bg-[rgb(57_42_33_/_42%)] p-3 backdrop-blur-[3px] sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-[var(--paper)] p-5 shadow-[0_24px_80px_rgb(57_42_33_/_30%)] transition sm:p-7 motion-reduce:transform-none motion-reduce:transition-none"
      >
        <h2 id={titleId} className="text-xl font-semibold text-[var(--ink)]">确认寄出这封信</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
          {capsule
            ? `将在 ${formatShanghaiDelivery(scheduledFor ?? "")} 自动送达，送达前可以撤回或退回草稿箱。`
            : "寄出后不能修改，24小时内可以撤回。"}
        </p>
        <div className="mt-7 grid gap-2 sm:grid-cols-2 sm:gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-11 rounded-full border border-[rgb(71_56_45_/_18%)] bg-white/65 px-4 font-medium text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            再检查一下
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="min-h-11 rounded-full bg-[var(--rose)] px-4 font-semibold text-[#3f2928] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-65"
          >
            {busy ? "正在寄出" : capsule ? "确认放进时间胶囊" : "确认寄出"}
          </button>
        </div>
      </div>
    </div>
  );
}
