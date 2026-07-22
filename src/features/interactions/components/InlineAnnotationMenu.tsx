"use client";

import { useRef, useState, useTransition } from "react";
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
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [comment, setComment] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function captureSelection() {
    const selection = window.getSelection();
    const body = bodyRef.current;
    if (!selection || !body || selection.isCollapsed || !selection.toString()) return;
    const anchorInside = Boolean(selection.anchorNode && body.contains(selection.anchorNode));
    const focusInside = Boolean(selection.focusNode && body.contains(selection.focusNode));
    if (!anchorInside || !focusInside) {
      setAnchor(null);
      setMessage(CROSS_BLOCK_SELECTION_MESSAGE);
      return;
    }
    if (selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const prefix = range.cloneRange();
    prefix.selectNodeContents(body);
    prefix.setEnd(range.startContainer, range.startOffset);
    const quotedText = range.toString();
    if (!quotedText.trim()) return;
    const startOffset = Array.from(prefix.toString()).length;
    setAnchor({ startOffset, endOffset: startOffset + Array.from(quotedText).length, quotedText });
    setMessage("");
  }

  function closeMenu() {
    setAnchor(null);
    setComment("");
    window.getSelection()?.removeAllRanges();
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
        onMouseUp={captureSelection}
        onPointerUp={captureSelection}
        onKeyUp={captureSelection}
        className="whitespace-pre-wrap rounded-[1.5rem] bg-white/55 p-5 leading-8 text-[var(--ink)]"
      >
        <BodyWithHighlights content={content} annotations={annotations} />
      </div>

      {anchor ? (
        <div role="dialog" aria-label="添加划线评注" className="mt-3 rounded-2xl border border-[rgb(71_56_45_/_14%)] bg-[var(--paper)] p-4 shadow-lg">
          <p className="text-sm text-[var(--muted-ink)]">“{anchor.quotedText}”</p>
          <label htmlFor="annotation-comment" className="sr-only">评注</label>
          <textarea id="annotation-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} className="mt-3 w-full rounded-xl border bg-white p-3" />
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
