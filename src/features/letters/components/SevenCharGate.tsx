"use client";

import { useState, useTransition } from "react";
import { createOpenResponseAction } from "@/features/letters/actions";

const QUICK_RESPONSES = ["抱抱", "我也", "亲亲", "收到", "想你"];

export function SevenCharGate({
  letterId,
  authorName,
  authorAvatarUrl,
  sevenCharLine,
  onOpened,
}: {
  letterId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  sevenCharLine: string;
  onOpened: () => void;
}) {
  const [responseText, setResponseText] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const canSubmit = responseText.trim().length > 0 && Array.from(responseText.trim()).length <= 3 && !isPending;

  function submitResponse() {
    startTransition(async () => {
      const result = await createOpenResponseAction({ letterId, responseText });
      setMessage(result.message);
      if (result.ok) {
        onOpened();
      }
    });
  }

  return (
    <section className="hand-card rounded-[2rem] p-6 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white text-2xl shadow-sm">
        {authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={authorAvatarUrl} alt={authorName} className="h-full w-full object-cover" />
        ) : (
          "♡"
        )}
      </div>
      <p className="mt-3 text-sm text-[var(--muted-ink)]">{authorName} 写给你一句话</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--ink)]">“{sevenCharLine}”</p>
      <p className="mt-4 text-sm text-[var(--muted-ink)]">回应最多三个字，信纸才会展开。</p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {QUICK_RESPONSES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setResponseText(item)}
            className="rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)]"
          >
            {item}
          </button>
        ))}
      </div>

      <input
        value={responseText}
        maxLength={3}
        onChange={(event) => setResponseText(event.target.value)}
        placeholder="三个字"
        className="mt-5 w-full max-w-[12rem] rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 text-center text-lg outline-none"
      />

      {message ? <p className="mt-3 text-sm text-[var(--muted-ink)]">{message}</p> : null}

      <button
        disabled={!canSubmit}
        onClick={submitResponse}
        className="mt-5 rounded-full bg-[var(--ink)] px-6 py-3 text-white disabled:opacity-50"
        type="button"
      >
        {isPending ? "展信中..." : "展信"}
      </button>
    </section>
  );
}
