"use client";

import { useState, useTransition } from "react";
import { createAnnotationAction, createAnnotationReplyAction } from "@/features/annotations/actions";
import type { LetterAnnotation } from "@/features/letters/actions";

export function AnnotationLayer({ letterId, annotations }: { letterId: string; annotations: LetterAnnotation[] }) {
  const [quotedText, setQuotedText] = useState("");
  const [comment, setComment] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function captureSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    setQuotedText(text);
    if (!text) setMessage("请先选中正文里想评点的文字。");
  }

  function submitAnnotation() {
    startTransition(async () => {
      const result = await createAnnotationAction({
        letterId,
        quotedText,
        startOffset: 0,
        endOffset: quotedText.length,
        comment,
      });
      setMessage(result.message);
      if (result.ok) {
        setQuotedText("");
        setComment("");
      }
    });
  }

  function submitReply(annotationId: string) {
    startTransition(async () => {
      const result = await createAnnotationReplyAction({ annotationId, body: replyBodies[annotationId] ?? "" });
      setMessage(result.message);
      if (result.ok) setReplyBodies((current) => ({ ...current, [annotationId]: "" }));
    });
  }

  return (
    <section className="mt-6 rounded-[1.5rem] bg-white/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-[var(--ink)]">划线评点</h3>
        <button type="button" onClick={captureSelection} className="rounded-full bg-white/70 px-4 py-2 text-sm">
          评点选中文字
        </button>
      </div>

      {quotedText ? (
        <div className="mt-4 rounded-2xl bg-white/70 p-4">
          <p className="text-sm text-[var(--muted-ink)]">“{quotedText}”</p>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder="写下你的评点"
            className="mt-3 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white px-4 py-3 outline-none"
          />
          <button disabled={isPending} onClick={submitAnnotation} type="button" className="mt-3 rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white">
            留下评点
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-sm text-[var(--muted-ink)]">{message}</p> : null}

      <div className="mt-5 grid gap-3">
        {annotations.map((annotation) => (
          <article key={annotation.id} id={`annotation-${annotation.id}`} className="rounded-2xl bg-white/65 p-4">
            <p className="text-sm text-[var(--muted-ink)]">“{annotation.quotedText}”</p>
            <p className="mt-2 text-[var(--ink)]">{annotation.comment}</p>
            <p className="mt-2 text-xs text-[var(--muted-ink)]">— {annotation.authorName}</p>

            <div className="mt-3 grid gap-2">
              {annotation.replies.map((reply) => (
                <p key={reply.id} className="rounded-xl bg-[var(--paper)] px-3 py-2 text-sm">
                  {reply.authorName}：{reply.body}
                </p>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={replyBodies[annotation.id] ?? ""}
                onChange={(event) => setReplyBodies((current) => ({ ...current, [annotation.id]: event.target.value }))}
                placeholder="回复"
                className="min-w-0 flex-1 rounded-full border border-[rgb(71_56_45_/_18%)] bg-white px-4 py-2 text-sm outline-none"
              />
              <button disabled={isPending} onClick={() => submitReply(annotation.id)} type="button" className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white">
                回复
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
