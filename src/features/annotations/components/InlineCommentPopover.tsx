"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createAnnotationAction, createAnnotationReplyAction } from "@/features/annotations/actions";
import type { SelectionAnchor } from "@/features/annotations/selection-anchor";
import type { LetterAnnotation } from "@/features/letters/queries";
import { placeCommentPopover } from "./comment-popover-geometry";
import type { RectLike, ViewportLike } from "./selection-menu-geometry";

type Mode =
  | { kind: "create"; letterId: string; anchor: SelectionAnchor }
  | { kind: "thread"; annotation: LetterAnnotation; threads: LetterAnnotation[] };

function focusable(dialog: HTMLElement | null) {
  return dialog
    ? Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), input:not([disabled])"))
    : [];
}

function currentViewport(): ViewportLike {
  const viewport = window.visualViewport;
  return viewport
    ? { offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop, width: viewport.width, height: viewport.height }
    : { offsetLeft: 0, offsetTop: 0, width: window.innerWidth, height: window.innerHeight };
}

export function InlineCommentPopover({
  mode,
  anchorRect,
  onClose,
  onSaved,
}: {
  mode: Mode;
  anchorRect: RectLike | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [comment, setComment] = useState("");
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState(mode.kind === "thread" ? mode.annotation.id : null);
  const [dialogPlacement, setDialogPlacement] = useState({ left: 12, top: 12, maxWidth: 384, maxHeight: 480 });
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);
  const activeThread = mode.kind === "thread"
    ? mode.threads.find((thread) => thread.id === activeId) ?? mode.annotation
    : null;

  const close = useCallback(() => {
    if (busy) return;
    closingRef.current = true;
    onClose();
    openerRef.current?.focus();
  }, [busy, onClose]);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const reposition = () => {
      const viewport = currentViewport();
      const measured = dialogRef.current?.getBoundingClientRect();
      const width = measured && measured.width > 0 ? measured.width : 384;
      const height = measured && measured.height > 0 ? measured.height : 400;
      const fallback = {
        left: viewport.offsetLeft + viewport.width / 2,
        right: viewport.offsetLeft + viewport.width / 2,
        top: viewport.offsetTop + 80,
        bottom: viewport.offsetTop + 80,
      };
      const next = placeCommentPopover(anchorRect ?? fallback, { width, height }, viewport);
      setDialogPlacement((current) => (
        current.left === next.left
        && current.top === next.top
        && current.maxWidth === next.maxWidth
        && current.maxHeight === next.maxHeight
      )
        ? current
        : { left: next.left, top: next.top, maxWidth: next.maxWidth, maxHeight: next.maxHeight });
    };
    reposition();
    const visualViewport = window.visualViewport;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(reposition);
    if (dialogRef.current) resizeObserver?.observe(dialogRef.current);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    visualViewport?.addEventListener?.("resize", reposition);
    visualViewport?.addEventListener?.("scroll", reposition);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      visualViewport?.removeEventListener?.("resize", reposition);
      visualViewport?.removeEventListener?.("scroll", reposition);
      resizeObserver?.disconnect();
    };
  }, [anchorRect]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable(dialogRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!closingRef.current && dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        focusable(dialogRef.current)[0]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [close]);

  async function submitComment() {
    if (mode.kind !== "create" || submittingRef.current || !comment.trim()) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const result = await createAnnotationAction({ letterId: mode.letterId, ...mode.anchor, comment });
      setMessage(result.message);
      if (result.ok) {
        setComment("");
        onSaved();
      }
    } catch {
      setMessage("提交失败，请稍后再试。");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function submitReply() {
    if (!activeThread || submittingRef.current || !reply.trim()) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const result = await createAnnotationReplyAction({ annotationId: activeThread.id, body: reply });
      setMessage(result.message);
      if (result.ok) {
        setReply("");
        onSaved();
      }
    } catch {
      setMessage("回复失败，请稍后再试。");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  const quote = mode.kind === "create" ? mode.anchor.quotedText : activeThread?.quotedText ?? "";
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={busy}
      style={{
        "--popover-left": `${dialogPlacement.left}px`,
        "--popover-top": `${dialogPlacement.top}px`,
        "--popover-max-width": `${dialogPlacement.maxWidth}px`,
        "--popover-max-height": `${dialogPlacement.maxHeight}px`,
      } as CSSProperties}
      className="fixed z-50 flex max-h-[var(--popover-max-height)] max-w-[var(--popover-max-width)] flex-col overflow-hidden rounded-[1.35rem] border border-[rgb(71_56_45_/_14%)] bg-[var(--paper)] p-4 text-[var(--ink)] shadow-[0_18px_48px_rgb(120_68_76_/_22%)] max-sm:inset-x-3 max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:w-auto sm:bottom-auto sm:left-[var(--popover-left)] sm:top-[var(--popover-top)] sm:w-[min(24rem,var(--popover-max-width))] motion-reduce:transition-none"
    >
      <p id={titleId} className="text-sm font-semibold">
        {mode.kind === "create" ? "留下评论" : "评点"}
      </p>
      {mode.kind === "thread" && mode.threads.length > 1 ? (
        <div className="mt-3 flex max-h-24 gap-2 overflow-x-auto pb-1" aria-label="评点列表">
          {mode.threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              aria-pressed={thread.id === activeThread?.id}
              onClick={() => setActiveId(thread.id)}
              className="min-h-11 shrink-0 rounded-full bg-white/70 px-3 text-xs text-[var(--muted-ink)] aria-pressed:bg-[rgb(222_120_133_/_18%)]"
            >“{thread.quotedText.slice(0, 18)}”</button>
          ))}
        </div>
      ) : null}
      <blockquote className="mt-3 max-h-28 shrink-0 overflow-y-auto border-l-2 border-[rgb(174_78_94_/_45%)] pl-3 text-sm leading-6 text-[var(--muted-ink)]">
        “{quote}”
      </blockquote>

      {mode.kind === "create" ? (
        <>
          <textarea
            ref={firstFieldRef}
            aria-label="评论内容"
            maxLength={1000}
            rows={4}
            value={comment}
            readOnly={busy}
            onChange={(event) => setComment(event.target.value)}
            placeholder="写下你想说的话…"
            className="mt-3 w-full resize-none rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/75 px-3 py-2.5 text-base leading-6 outline-none focus:border-[rgb(174_78_94_/_55%)] focus:ring-2 focus:ring-[rgb(222_120_133_/_18%)] disabled:opacity-60"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={close} className="min-h-11 rounded-full px-4 text-sm text-[var(--muted-ink)] disabled:opacity-50">取消</button>
            <button type="button" disabled={busy || !comment.trim()} onClick={submitComment} className="min-h-11 rounded-full bg-[var(--ink)] px-4 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "提交中…" : "留下评论"}
            </button>
          </div>
        </>
      ) : activeThread ? (
        <>
          <div className="mt-3 min-h-0 overflow-y-auto rounded-2xl bg-white/65 p-3">
            <p className="leading-6">{activeThread.comment}</p>
            <p className="mt-1 text-xs text-[var(--muted-ink)]">— {activeThread.authorName}</p>
            {activeThread.replies.map((item) => (
              <p key={item.id} className="mt-2 rounded-xl bg-[var(--paper)] px-3 py-2 text-sm">
                <span className="font-medium">{item.authorName}：</span>{item.body}
              </p>
            ))}
          </div>
          <textarea
            ref={firstFieldRef}
            aria-label="回复评点"
            maxLength={2000}
            rows={2}
            value={reply}
            readOnly={busy}
            onChange={(event) => setReply(event.target.value)}
            placeholder="回复这条评点…"
            className="mt-3 w-full resize-none rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/75 px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-[rgb(222_120_133_/_18%)] disabled:opacity-60"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={close} className="min-h-11 rounded-full px-4 text-sm text-[var(--muted-ink)] disabled:opacity-50">关闭</button>
            <button type="button" disabled={busy || !reply.trim()} onClick={submitReply} className="min-h-11 rounded-full bg-[var(--ink)] px-4 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "发送中…" : "回复"}
            </button>
          </div>
        </>
      ) : null}
      {message ? <p role="status" className="mt-2 text-sm text-[var(--muted-ink)]">{message}</p> : null}
    </div>
  );
}
