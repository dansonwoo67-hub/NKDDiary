"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { shareDailyQuoteAsMoodAction } from "@/features/mood/actions";

function formatRelationshipDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${year}年${month}月${day}日`;
}

export function HomeHero({
  daysTogether,
  relationshipStartedOn,
  dailyQuote,
}: {
  daysTogether: number;
  relationshipStartedOn: string;
  dailyQuote?: string;
}) {
  const quote = dailyQuote ?? "日子不必轰轰烈烈，被认真记住就已经很浪漫。";
  const [clicks, setClicks] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [pending, startTransition] = useTransition();

  function loveQuote() {
    if (shared || pending) return;
    const next = clicks + 1;
    setClicks(next);
    if (next === 1) setHint("再点四次，会有一个小彩蛋哦");
    if (next < 5) return;
    setHint(null);
    if (!window.confirm("看起来你很喜欢这句话，要把它变成今天的心情分享给对方吗？")) {
      setClicks(0);
      return;
    }
    startTransition(async () => {
      const result = await shareDailyQuoteAsMoodAction(quote);
      setHint(result.message);
      if (result.ok) setShared(true);
    });
  }

  return (
    <section className="hand-card relative overflow-hidden rounded-[2rem] px-6 py-7 sm:px-8 sm:py-9">
      <div aria-hidden="true" className="absolute -right-5 -top-5 h-28 w-28 rounded-full bg-[rgb(255_232_157_/_26%)] blur-xl" />
      <div className="relative">
        <p className="text-xs tracking-[0.28em] text-[var(--muted-ink)]">我们已经在一起</p>
        <div className="mt-3 flex items-end gap-2">
          <p className="font-serif text-6xl leading-none font-semibold sm:text-7xl">{daysTogether}</p>
          <p className="pb-1.5 text-base text-[var(--muted-ink)]">天</p>
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm text-[var(--muted-ink)]">
          <Heart aria-hidden="true" size={15} className="fill-[rgb(237_49_91_/_16%)] text-[var(--rose)]" />
          <span>从 {formatRelationshipDate(relationshipStartedOn)} 开始</span>
        </div>
        <div className="mt-4 flex items-start gap-2 border-t border-[var(--line)]/70 pt-4">
          <p className="flex-1 font-serif text-base leading-7 text-[var(--ink)]/80">{quote}</p>
          <button
            type="button"
            onClick={loveQuote}
            className={`quote-love-button ${clicks ? "is-loved" : ""}`}
            aria-label="喜欢这句话"
            disabled={pending || shared}
          >
            <Heart size={18} aria-hidden="true" />
          </button>
        </div>
        {hint ? <p role="status" className="mt-2 text-xs text-[var(--rose)]/80">{hint}</p> : null}
      </div>
    </section>
  );
}
