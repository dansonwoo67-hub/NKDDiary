import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listRecentMoods } from "@/features/mood/actions";
import { MoodCard } from "@/features/mood/components/MoodCard";
import { MoodComposer } from "@/features/mood/components/MoodComposer";
import { requireUser } from "@/lib/auth/require-user";

export default async function MoodPage() {
  const [{ userId }, moods] = await Promise.all([requireUser(), listRecentMoods()]);
  const now = new Date();

  return <div className="grid gap-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold tracking-[0.22em] text-[var(--rose)]">MOOD</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">我们此刻的心情</h1>
        <p className="mt-2 text-sm text-[var(--muted-ink)]">一句话也好，一个表情也好，留住当下。</p>
      </div>
      <Link href="/memories" className="cos-button-secondary gap-2 px-4 text-sm">
        <ArrowLeft aria-hidden="true" size={17} />
        返回回忆
      </Link>
    </header>

    <MoodComposer />

    <section className="grid gap-3" aria-label="最近心情">
      {moods.map((mood) => {
        const profile = Array.isArray(mood.profiles) ? mood.profiles[0] : mood.profiles;
        const body = String(mood.body ?? "").trim();
        const emoji = String(mood.emoji ?? "").trim();
        return (
          <MoodCard
            key={String(mood.id)}
            viewerId={userId}
            now={now}
            entry={{
              id: String(mood.id),
              authorId: String(mood.author_id),
              authorName: profile && typeof profile === "object" && "display_name" in profile ? String(profile.display_name) : "我们",
              content: [emoji, body].filter(Boolean).join(" "),
              createdAt: String(mood.created_at),
            }}
          />
        );
      })}
      {moods.length === 0 ? (
        <div className="cos-card px-5 py-12 text-center text-sm text-[var(--muted-ink)]">
          还没有心情记录，从此刻开始吧。
        </div>
      ) : null}
    </section>
  </div>;
}
