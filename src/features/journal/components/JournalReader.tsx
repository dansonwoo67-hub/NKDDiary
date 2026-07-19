"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import type { JournalActionResult } from "@/features/journal/actions";
import type { JournalEntry } from "@/features/journal/repository";

type JournalReaderProps = {
  entry: Pick<
    JournalEntry,
    "id" | "authorId" | "entryType" | "title" | "content" | "imagePath" | "entryDate" | "publishedAt" | "updatedAt" | "lockedAt"
  >;
  authorName: string;
  canManageTodayDiary: boolean;
  todayDiaryState: "editable" | "author-only" | "locked" | "sealed";
  editHref?: string;
  deleteAction?: (entryId: string) => Promise<JournalActionResult>;
  image?: ReactNode;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export function JournalReader({
  entry,
  authorName,
  canManageTodayDiary,
  todayDiaryState,
  editHref,
  deleteAction,
  image,
}: JournalReaderProps) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const canManage = entry.entryType === "today" && canManageTodayDiary;

  function handleDelete() {
    if (!deleteAction || !canManage) return;
    startTransition(async () => {
      const result = await deleteAction(entry.id);
      setMessage(result.message);
    });
  }

  return (
    <article className="hand-card rounded-[2rem] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--muted-ink)]">作者：{authorName}</p>
          {entry.entryDate ? <time className="mt-1 block text-sm text-[var(--muted-ink)]">{entry.entryDate}</time> : null}
        </div>
        <p className="rounded-full bg-white/70 px-3 py-1 text-sm text-[var(--muted-ink)]">
          {{ editable: "可编辑", "author-only": "仅作者可编辑", locked: "已锁定", sealed: "已封存" }[todayDiaryState]}
        </p>
      </div>

      <h1 className="mt-5 text-3xl font-semibold text-[var(--ink)]">{entry.title}</h1>
      <dl className="mt-4 grid gap-2 text-sm text-[var(--muted-ink)]">
        <div>
          <dt className="inline">发布时间：</dt>
          <dd className="inline">{formatDateTime(entry.publishedAt)}</dd>
        </div>
        <div>
          <dt className="inline">更新时间：</dt>
          <dd className="inline">{formatDateTime(entry.updatedAt)}</dd>
        </div>
      </dl>

      <div className="mt-6 whitespace-pre-wrap rounded-[1.5rem] bg-white/55 p-5 leading-8 text-[var(--ink)]">{entry.content}</div>
      {image ? <div className="mt-6">{image}</div> : null}

      {canManage ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {editHref ? (
            <Link href={editHref} className="rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)]">
              编辑日记
            </Link>
          ) : null}
          {deleteAction ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-full border border-[rgb(71_56_45_/_28%)] px-4 py-2 text-sm text-[var(--ink)] disabled:opacity-50"
            >
              {isPending ? "正在删除…" : "删除日记"}
            </button>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-[var(--muted-ink)]" role="status">{message}</p> : null}
    </article>
  );
}
