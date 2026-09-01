"use client";

import Link from "next/link";
import type { LetterThreadSummary } from "../thread-repository";

const timeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatThreadTime(value: string) {
  const parts = Object.fromEntries(
    timeFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function LetterThreadList({ accountId, counterpartName, threads }: {
  accountId: string;
  counterpartName: string;
  threads: LetterThreadSummary[];
}) {
  if (!threads.length) {
    return <div className="cos-card py-16 text-center text-sm text-[var(--muted-ink)]">信箱里还安安静静的。</div>;
  }

  return (
    <div key={accountId} className="grid gap-4 md:grid-cols-2">
      {threads.map((thread) => (
        <Link
          key={thread.threadId}
          href={`/journal/thread/${encodeURIComponent(thread.threadId)}`}
          className="cos-card group relative min-w-0 overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-xl"
        >
          {thread.unread ? (
            <span className="absolute right-4 top-4 rounded-full bg-[var(--rose)] px-2 py-0.5 text-xs font-semibold text-white">未读</span>
          ) : null}
          <p className="pr-14 font-serif text-xl font-semibold">{counterpartName}</p>
          <p className="mt-3 line-clamp-2 break-words text-sm text-[var(--ink)]">{thread.latestPreview || "一封安静的信"}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted-ink)]">
            <span>往来 {thread.letterCount} 封</span>
            <time dateTime={thread.latestActivityAt}>{formatThreadTime(thread.latestActivityAt)}</time>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {thread.originType === "future" ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">始于一封胶囊信</span>
            ) : null}
            {thread.latestWithdrawn ? (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">最新信件已撤回</span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
