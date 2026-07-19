"use client";

import { useState, useTransition } from "react";
import type { JournalActionResult } from "@/features/journal/actions";

export type TodayDiarySubmission = {
  title: string;
  content: string;
  entryDate: string;
};

type TodayDiaryEditorProps = {
  today: string;
  action: (input: TodayDiarySubmission) => Promise<JournalActionResult>;
  initialValues?: Partial<Pick<TodayDiarySubmission, "title" | "content">>;
  submitLabel?: string;
};

function countCharacters(value: string) {
  return Array.from(value).length;
}

export function TodayDiaryEditor({
  today,
  action,
  initialValues,
  submitLabel = "发布今日日记",
}: TodayDiaryEditorProps) {
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function validate() {
    if (!title.trim() || !content.trim()) return "请填写标题和正文。";
    if (countCharacters(title) > 80) return "标题不能超过 80 个字符。";
    if (countCharacters(content) > 20_000) return "正文不能超过 20000 个字符。";
    return null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validate();
    if (validationMessage) {
      setIsError(true);
      setMessage(validationMessage);
      return;
    }

    startTransition(async () => {
      const result = await action({
        title: title.trim(),
        content: content.trim(),
        entryDate: today,
      });
      setIsError(!result.ok);
      setMessage(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6" noValidate>
      <section className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">今日日记</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">记录 {today}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
          发布后 24 小时内可以编辑或删除，之后会自动锁定为共同回忆。
        </p>
      </section>

      <section className="hand-card rounded-[2rem] p-6">
        <label className="block text-sm text-[var(--ink)]" htmlFor="today-diary-title">
          标题
        </label>
        <input
          id="today-diary-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          aria-describedby="today-diary-title-count"
          className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none"
        />
        <p id="today-diary-title-count" className="mt-2 text-right text-xs text-[var(--muted-ink)]">
          {countCharacters(title)}/80
        </p>

        <label className="mt-5 block text-sm text-[var(--ink)]" htmlFor="today-diary-content">
          正文
        </label>
        <textarea
          id="today-diary-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={20_000}
          rows={12}
          aria-describedby="today-diary-content-count"
          className="mt-2 w-full rounded-[1.5rem] border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 leading-7 outline-none"
        />
        <p id="today-diary-content-count" className="mt-2 text-right text-xs text-[var(--muted-ink)]">
          {countCharacters(content)}/20000
        </p>

        {message ? (
          <p className="mt-5 rounded-2xl bg-white/60 px-4 py-3 text-sm text-[var(--muted-ink)]" role={isError ? "alert" : "status"}>
            {message}
          </p>
        ) : null}

        <button
          className="mt-6 rounded-full bg-[var(--ink)] px-6 py-3 text-white disabled:opacity-50"
          type="submit"
          disabled={isPending}
        >
          {isPending ? "正在保存…" : submitLabel}
        </button>
      </section>
    </form>
  );
}
