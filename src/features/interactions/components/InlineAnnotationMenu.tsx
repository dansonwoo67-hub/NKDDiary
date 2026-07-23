"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  createAnnotationAction,
  createReplyAction,
  deleteAnnotationAction,
  deleteReplyAction,
  type JournalAnnotation,
} from "@/features/interactions/actions";
import {
  CROSS_BLOCK_SELECTION_MESSAGE,
  JOURNAL_BODY_BLOCK_ID,
} from "@/features/interactions/rules";

type Anchor = { startOffset: number; endOffset: number; quotedText: string };
type ValidCandidate = { kind: "valid"; anchor: Anchor; origin: HTMLElement | null };
type SelectionCandidate = ValidCandidate | { kind: "cross-block" } | null;

function BodyWithHighlights({ content, annotations }: { content: string; annotations: JournalAnnotation[] }) {
  const characters = Array.from(content);
  const boundaries = new Set([0, characters.length]);
  for (const annotation of annotations) {
    boundaries.add(Math.max(0, Math.min(characters.length, annotation.startOffset)));
    boundaries.add(Math.max(0, Math.min(characters.length, annotation.endOffset)));
  }
  const ordered = [...boundaries].sort((a, b) => a - b);
  return ordered.slice(0, -1).map((start, index) => {
    const end = ordered[index + 1];
    const text = characters.slice(start, end).join("");
    const covering = annotations.filter((annotation) => annotation.startOffset <= start && annotation.endOffset >= end);
    return covering.length > 0 ? (
      <mark key={`${start}-${end}`} className="rounded bg-[rgb(244_190_190_/_50%)]" title={covering.map((item) => item.comment).join("；")}>{text}</mark>
    ) : <span key={`${start}-${end}`}>{text}</span>;
  });
}

export function InlineAnnotationMenu({ entryId, content, annotations }: { entryId: string; content: string; annotations: JournalAnnotation[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const keyboardBodyRef = useRef<HTMLTextAreaElement>(null);
  const annotationInputRef = useRef<HTMLTextAreaElement>(null);
  const candidateRef = useRef<SelectionCandidate>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pendingCandidate, setPendingCandidate] = useState<ValidCandidate | null>(null);
  const [comment, setComment] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function readWindowSelection(): SelectionCandidate {
    const selection = window.getSelection();
    const body = bodyRef.current;
    if (!selection || !body || selection.isCollapsed || !selection.toString()) return null;
    const anchorInside = Boolean(selection.anchorNode && body.contains(selection.anchorNode));
    const focusInside = Boolean(selection.focusNode && body.contains(selection.focusNode));
    if (!anchorInside && !focusInside) return null;
    if (anchorInside !== focusInside) return { kind: "cross-block" };
    if (selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const prefix = range.cloneRange();
    prefix.selectNodeContents(body);
    prefix.setEnd(range.startContainer, range.startOffset);
    const quotedText = range.toString();
    if (!quotedText.trim()) return null;
    const startOffset = Array.from(prefix.toString()).length;
    return {
      kind: "valid",
      anchor: { startOffset, endOffset: startOffset + Array.from(quotedText).length, quotedText },
      origin: body,
    };
  }

  function readKeyboardSelection(): SelectionCandidate {
    const textarea = keyboardBodyRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) return null;
    const quotedText = content.slice(textarea.selectionStart, textarea.selectionEnd);
    if (!quotedText.trim()) return null;
    return {
      kind: "valid",
      anchor: {
        startOffset: Array.from(content.slice(0, textarea.selectionStart)).length,
        endOffset: Array.from(content.slice(0, textarea.selectionEnd)).length,
        quotedText,
      },
      origin: textarea,
    };
  }

  function readCurrentSelection(): SelectionCandidate {
    return document.activeElement === keyboardBodyRef.current
      ? readKeyboardSelection()
      : readWindowSelection();
  }

  function commitCandidate(forTouch: boolean) {
    const candidate = candidateRef.current;
    candidateRef.current = null;
    if (!candidate) return;
    if (candidate.kind === "cross-block") {
      setAnchor(null);
      setPendingCandidate(null);
      setMessage(CROSS_BLOCK_SELECTION_MESSAGE);
      return;
    }
    setMessage("");
    restoreFocusRef.current = candidate.origin;
    if (forTouch) {
      setPendingCandidate(candidate);
      return;
    }
    window.getSelection()?.removeAllRanges();
    setPendingCandidate(null);
    setAnchor(candidate.anchor);
  }

  useEffect(() => {
    function handleSelectionChange() {
      candidateRef.current = readCurrentSelection();
    }
    function handlePointerUp(event: PointerEvent) {
      if (anchor) return;
      candidateRef.current = readWindowSelection();
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      if (event.pointerType === "touch") {
        touchTimerRef.current = setTimeout(() => commitCandidate(true), 350);
      } else {
        commitCandidate(false);
      }
    }
    function handleKeyUp() {
      if (anchor) return;
      candidateRef.current = readCurrentSelection();
      commitCandidate(false);
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("keyup", handleKeyUp);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    };
  });

  useEffect(() => {
    if (anchor) annotationInputRef.current?.focus();
  }, [anchor]);

  function closeMenu() {
    setAnchor(null);
    setComment("");
    candidateRef.current = null;
    window.getSelection()?.removeAllRanges();
    queueMicrotask(() => restoreFocusRef.current?.focus());
  }

  function openPendingCandidate() {
    if (!pendingCandidate) return;
    restoreFocusRef.current = pendingCandidate.origin;
    window.getSelection()?.removeAllRanges();
    setAnchor(pendingCandidate.anchor);
    setPendingCandidate(null);
  }

  function submitAnnotation() {
    if (!anchor) return;
    startTransition(async () => {
      const result = await createAnnotationAction({ entryId, blockId: JOURNAL_BODY_BLOCK_ID, ...anchor, comment });
      setMessage(result.message);
      if (result.ok) closeMenu();
    });
  }

  function submitReply(annotationId: string) {
    startTransition(async () => {
      const result = await createReplyAction({ annotationId, entryId, body: replyBodies[annotationId] ?? "" });
      setMessage(result.message);
      if (result.ok) setReplyBodies((current) => ({ ...current, [annotationId]: "" }));
    });
  }

  return (
    <section className="mt-6" onKeyDown={(event) => { if (event.key === "Escape") closeMenu(); }}>
      <div
        ref={bodyRef}
        data-block-id="body"
        tabIndex={0}
        aria-label="日记正文，可选择文字后添加评注"
        className="whitespace-pre-wrap rounded-[1.5rem] bg-white/55 p-5 leading-8 text-[var(--ink)]"
      >
        <BodyWithHighlights content={content} annotations={annotations} />
      </div>

      <details className="mt-2 text-sm text-[var(--muted-ink)]">
        <summary className="cursor-pointer">使用键盘选择文字</summary>
        <label htmlFor="keyboard-journal-body" className="sr-only">键盘选择日记正文</label>
        <textarea
          ref={keyboardBodyRef}
          id="keyboard-journal-body"
          aria-label="键盘选择日记正文"
          value={content}
          readOnly
          rows={4}
          onSelect={() => { candidateRef.current = readKeyboardSelection(); }}
          className="mt-2 w-full rounded-xl border bg-white/70 p-3 text-[var(--ink)]"
        />
      </details>

      {pendingCandidate ? (
        <div className="mt-3 flex justify-end">
          <button type="button" onPointerUp={(event) => event.stopPropagation()} onClick={openPendingCandidate} className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white">
            添加评注
          </button>
        </div>
      ) : null}

      {anchor ? (
        <div role="dialog" aria-label="添加划线评注" className="mt-3 rounded-2xl border border-[rgb(71_56_45_/_14%)] bg-[var(--paper)] p-4 shadow-lg">
          <p className="text-sm text-[var(--muted-ink)]">“{anchor.quotedText}”</p>
          <label htmlFor="annotation-comment" className="sr-only">评注</label>
          <textarea ref={annotationInputRef} id="annotation-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} className="mt-3 w-full rounded-xl border bg-white p-3" />
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={isPending || !comment.trim()} onClick={submitAnnotation} className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-50">发布评注</button>
            <button type="button" onClick={closeMenu} className="rounded-full px-4 py-2 text-sm">取消</button>
          </div>
        </div>
      ) : null}

      {message ? <p role="status" className="mt-3 text-sm text-[var(--muted-ink)]">{message}</p> : null}

      <div className="mt-5 grid gap-3" aria-label="划线评注">
        {annotations.map((annotation) => (
          <article key={annotation.id} id={`annotation-${annotation.id}`} className="rounded-2xl bg-white/65 p-4">
            <p className="text-sm text-[var(--muted-ink)]">“{annotation.quotedText}” · {annotation.authorName}</p>
            <p className="mt-2 whitespace-pre-wrap text-[var(--ink)]">{annotation.comment}</p>
            {annotation.canManage ? <button type="button" className="mt-2 text-xs text-[var(--muted-ink)]" onClick={() => startTransition(async () => setMessage((await deleteAnnotationAction({ annotationId: annotation.id, entryId })).message))}>删除评注</button> : null}
            <div className="mt-3 grid gap-2">
              {annotation.replies.map((reply) => (
                <div key={reply.id} className="rounded-xl bg-[var(--paper)] px-3 py-2 text-sm">
                  <span>{reply.authorName}：{reply.body}</span>
                  {reply.canManage ? <button type="button" className="ml-3 text-xs text-[var(--muted-ink)]" onClick={() => startTransition(async () => setMessage((await deleteReplyAction({ replyId: reply.id, entryId })).message))}>删除</button> : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <label className="sr-only" htmlFor={`reply-${annotation.id}`}>回复评注</label>
              <input id={`reply-${annotation.id}`} value={replyBodies[annotation.id] ?? ""} onChange={(event) => setReplyBodies((current) => ({ ...current, [annotation.id]: event.target.value }))} className="min-w-0 flex-1 rounded-full border bg-white px-4 py-2 text-sm" />
              <button type="button" disabled={isPending || !(replyBodies[annotation.id] ?? "").trim()} onClick={() => submitReply(annotation.id)} className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-50">回复</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
