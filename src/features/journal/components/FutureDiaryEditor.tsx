"use client";

import { useState, useTransition } from "react";
import type { JournalActionResult } from "@/features/journal/actions";
import { uploadJournalImageAction } from "@/features/media/actions";
import { ImagePicker } from "@/features/media/ImagePicker";

export type FutureDiarySubmission = {
  title: string;
  content: string;
  recipientId: string;
  openAt: string;
};

type FutureDiaryEditorProps = {
  recipientId: string;
  recipientName: string;
  action: (input: FutureDiarySubmission) => Promise<JournalActionResult>;
};

export function shanghaiWallTimeToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute));
  const check = new Date(utc + 8 * 60 * 60 * 1_000);
  if (
    check.getUTCFullYear() !== Number(year)
    || check.getUTCMonth() !== Number(month) - 1
    || check.getUTCDate() !== Number(day)
    || check.getUTCHours() !== Number(hour)
    || check.getUTCMinutes() !== Number(minute)
  ) return null;
  return new Date(utc).toISOString();
}

function countCharacters(value: string) {
  return Array.from(value).length;
}

export function FutureDiaryEditor({ recipientId, recipientName, action }: FutureDiaryEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [image, setImage] = useState<Blob | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      setIsError(true);
      setMessage("请填写标题和正文。");
      return;
    }
    const openingIso = shanghaiWallTimeToIso(openAt);
    if (!openingIso || new Date(openingIso).getTime() <= Date.now()) {
      setIsError(true);
      setMessage("请选择一个晚于现在的有效开启时间。");
      return;
    }

    startTransition(async () => {
      try {
        const submission = {
          title: title.trim(),
          content: content.trim(),
          recipientId,
          openAt: openingIso,
        };
        let result: JournalActionResult;
        if (image) {
          const formData = new FormData();
          formData.set("image", image, "journal.webp");
          result = await uploadJournalImageAction({ kind: "seal-future", ...submission }, formData);
        } else {
          result = await action(submission);
        }
        setIsError(!result.ok);
        setMessage(result.message);
      } catch {
        setIsError(true);
        setMessage("操作失败，请稍后再试。");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6" noValidate>
      <section className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">FOR LATER</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">写给未来的 {recipientName}</h1>
        <p className="mt-3 leading-7 text-[var(--muted-ink)]">封存后不能修改、撤回或删除。你仍可在“我写出的”中回看。</p>
      </section>
      <section className="hand-card rounded-[2rem] p-6">
        <label className="block text-sm text-[var(--ink)]" htmlFor="future-diary-title">标题</label>
        <input id="future-diary-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required aria-required="true" className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none" />
        <p className="mt-2 text-right text-xs text-[var(--muted-ink)]">{countCharacters(title)}/80</p>
        <label className="mt-5 block text-sm text-[var(--ink)]" htmlFor="future-diary-content">正文</label>
        <textarea id="future-diary-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={20_000} rows={12} required aria-required="true" className="mt-2 w-full rounded-[1.5rem] border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 leading-7 outline-none" />
        <p className="mt-2 text-right text-xs text-[var(--muted-ink)]">{countCharacters(content)}/20000</p>
        <label className="mt-5 block text-sm text-[var(--ink)]" htmlFor="future-diary-open-at">开启时间</label>
        <input id="future-diary-open-at" type="datetime-local" value={openAt} onChange={(event) => setOpenAt(event.target.value)} required aria-required="true" aria-describedby="future-diary-time-help" className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none" />
        <p id="future-diary-time-help" className="mt-2 text-xs text-[var(--muted-ink)]">按中国标准时间（Asia/Shanghai）设置，必须晚于现在。</p>
        <ImagePicker value={image} onChange={setImage} disabled={isPending} />
        {message ? <p className="mt-5 rounded-2xl bg-white/60 px-4 py-3 text-sm text-[var(--muted-ink)]" role={isError ? "alert" : "status"}>{message}</p> : null}
        <button type="submit" disabled={isPending} className="mt-6 rounded-full bg-[var(--ink)] px-6 py-3 text-white disabled:opacity-50">
          {isPending ? "正在封存…" : "确认封存"}
        </button>
      </section>
    </form>
  );
}
