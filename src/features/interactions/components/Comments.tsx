"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createCommentAction,
  deleteCommentAction,
  updateCommentAction,
  type JournalComment,
} from "@/features/interactions/actions";
import { countGraphemes } from "@/features/interactions/rules";

export function Comments({ entryId, comments }: { entryId: string; comments: JournalComment[] }) {
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const chronological = useMemo(
    () => comments.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [comments],
  );

  function submit() {
    startTransition(async () => {
      const result = await createCommentAction({ entryId, body });
      setMessage(result.message);
      if (result.ok) setBody("");
    });
  }

  function save(commentId: string) {
    startTransition(async () => {
      const result = await updateCommentAction({ commentId, entryId, body: editingBody });
      setMessage(result.message);
      if (result.ok) setEditingId(null);
    });
  }

  function remove(commentId: string) {
    startTransition(async () => {
      const result = await deleteCommentAction({ commentId, entryId });
      setMessage(result.message);
    });
  }

  return (
    <section className="mt-8 rounded-[1.5rem] bg-white/45 p-4" aria-labelledby="comments-title">
      <h2 id="comments-title" className="font-semibold text-[var(--ink)]">评论</h2>
      <div className="mt-4 grid gap-3">
        {chronological.map((comment) => (
          <article key={comment.id} data-testid="journal-comment" className="rounded-2xl bg-white/70 p-4">
            <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted-ink)]">
              <span>{comment.authorName}</span>
              <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("zh-CN")}</time>
            </div>
            {editingId === comment.id ? (
              <div className="mt-2">
                <label className="sr-only" htmlFor={`edit-comment-${comment.id}`}>编辑评论</label>
                <textarea id={`edit-comment-${comment.id}`} value={editingBody} onChange={(event) => setEditingBody(event.target.value)} className="w-full rounded-xl border bg-white p-3" />
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={isPending} onClick={() => save(comment.id)} className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs text-white">保存</button>
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-3 py-1 text-xs">取消</button>
                </div>
              </div>
            ) : <p className="mt-2 whitespace-pre-wrap text-[var(--ink)]">{comment.body}</p>}
            {comment.canManage && editingId !== comment.id ? (
              <div className="mt-2 flex gap-3 text-xs text-[var(--muted-ink)]">
                <button type="button" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body); }}>编辑</button>
                <button type="button" disabled={isPending} onClick={() => remove(comment.id)}>删除</button>
              </div>
            ) : null}
          </article>
        ))}
        {chronological.length === 0 ? <p className="text-sm text-[var(--muted-ink)]">还没有评论。</p> : null}
      </div>
      <div className="mt-4">
        <label htmlFor="new-journal-comment" className="text-sm text-[var(--muted-ink)]">写评论</label>
        <textarea id="new-journal-comment" value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white p-3 outline-none" />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--muted-ink)]">{countGraphemes(body)}/200</span>
          <button type="button" disabled={isPending || !body.trim() || countGraphemes(body) > 200} onClick={submit} className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-50">发布评论</button>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-[var(--muted-ink)]" role="status">{message}</p> : null}
    </section>
  );
}
