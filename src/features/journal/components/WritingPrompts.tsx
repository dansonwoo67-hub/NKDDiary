import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

const prompts = [
  "今天最想告诉对方的一件小事是什么？",
  "最近哪个瞬间让你觉得我们更靠近了？",
  "有什么话想认真说，却一直没有找到机会？",
  "下一次见面时，你最期待一起做什么？",
] as const;

export function WritingPrompts() {
  return (
    <section className="cos-card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" size={18} className="text-[var(--orange)]" />
        <h2 className="font-serif text-xl font-semibold">不知道从哪里开始？</h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {prompts.map((prompt) => (
          <Link
            key={prompt}
            href={`/journal/new?prompt=${encodeURIComponent(prompt)}`}
            aria-label={`从这个问题开始：${prompt}`}
            className="group flex min-h-28 flex-col justify-between rounded-2xl border border-[var(--line)] bg-[rgb(237_49_91_/_4%)] p-4"
          >
            <span className="leading-6">“{prompt}”</span>
            <span className="mt-3 flex items-center gap-1 text-sm font-medium text-[var(--rose)]">
              从这里开始
              <ArrowRight aria-hidden="true" size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
