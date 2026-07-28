"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteMoodFromForm, updateMoodFromForm } from "@/features/mood/actions";
import { canAuthorMutate } from "@/features/mood/rules";

export type MoodCardEntry = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export function MoodCard({
  entry,
  viewerId,
  now = new Date(),
}: {
  entry: MoodCardEntry;
  viewerId: string;
  now?: Date;
}) {
  const [editing, setEditing] = useState(false);
  const editable = entry.authorId === viewerId && canAuthorMutate(entry.createdAt, now);

  return (
    <article className="cos-card p-5">
      <p className="text-lg leading-8 text-[var(--ink)]">{entry.content}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted-ink)]">
          {entry.authorName} ·{" "}
          <time dateTime={entry.createdAt}>
            {new Date(entry.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
          </time>
        </p>
        {editable ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className="cos-button-secondary gap-1 px-3 text-xs"
                aria-label="编辑心情"
                aria-expanded={editing}
                onClick={() => setEditing((value) => !value)}
              >
                <Pencil aria-hidden="true" size={14} />
                编辑
              </button>
              {editing ? (
                <form action={updateMoodFromForm} className="absolute right-0 z-10 mt-2 flex w-72 gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-xl">
                  <input type="hidden" name="id" value={entry.id} />
                  <input className="cos-input min-w-0 flex-1 px-3" name="content" defaultValue={entry.content} aria-label="修改心情" />
                  <button className="cos-button-primary px-3 text-xs" type="submit">
                    保存
                  </button>
                </form>
              ) : null}
            </div>
            <form action={deleteMoodFromForm}>
              <input type="hidden" name="id" value={entry.id} />
              <button className="cos-button-secondary gap-1 px-3 text-xs text-[var(--rose)]" type="submit" aria-label="删除心情">
                <Trash2 aria-hidden="true" size={14} />
                删除
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </article>
  );
}
