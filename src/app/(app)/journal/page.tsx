import { JournalCard } from "@/features/journal/components/JournalCard";
import { listTodayDiaryEntries } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function JournalPage() {
  const [{ userId }, supabase] = await Promise.all([requireUser(), createServerSupabaseClient()]);
  const todayEntries = await listTodayDiaryEntries(supabase);

  return (
    <div className="grid gap-8">
      <section className="grid gap-4" aria-labelledby="today-diaries-heading">
        <div>
          <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">JOURNAL</p>
          <h1 id="today-diaries-heading" className="mt-2 text-3xl font-semibold text-[var(--ink)]">
            今日日记
          </h1>
        </div>
        <JournalCard href="/journal/new" title="写一篇今日日记" description="记录此刻，发布后 24 小时内可继续编辑。" actionLabel="开始写日记" />
        {todayEntries.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {todayEntries.map((entry) => (
              <JournalCard
                key={entry.id}
                href={`/journal/${entry.id}`}
                title={entry.title}
                description={`${entry.authorId === userId ? "我" : "对方"}写于 ${entry.entryDate ?? "今天"}`}
                actionLabel="阅读日记"
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-white/55 px-4 py-3 text-sm text-[var(--muted-ink)]">还没有已发布的今日日记。</p>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="future-diaries-heading">
        <div>
          <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">FOR LATER</p>
          <h2 id="future-diaries-heading" className="mt-2 text-3xl font-semibold text-[var(--ink)]">
            未来日记
          </h2>
        </div>
        <JournalCard href="/journal/future" title="写给未来" description="把想说的话封存在一个约定的时刻。" actionLabel="查看未来日记" />
      </section>
    </div>
  );
}
