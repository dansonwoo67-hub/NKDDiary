import Link from "next/link";
import { ArrowRight, Heart, Sparkles } from "lucide-react";
import type { MemoryItem } from "@/features/memories/repository";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function StoryCard({
  item,
  authorName,
}: {
  item: MemoryItem;
  authorName: string;
}) {
  const isMood = item.kind === "mood";

  return (
    <article className={isMood ? "home-story-card home-story-card--mood" : "home-story-card"}>
      <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--muted-ink)]">
        <span className="font-medium text-[var(--ink)]/75">{authorName}</span>
        <time>{formatDate(item.occurredAt)}</time>
      </div>
      <div className="mt-2 flex items-start gap-2">
        {isMood ? (
          <Sparkles aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-[var(--orange)]" />
        ) : (
          <Heart aria-hidden="true" size={15} className="mt-0.5 shrink-0 fill-[rgb(237_49_91_/_12%)] text-[var(--rose)]" />
        )}
        <div className="min-w-0">
          <h3 className={isMood ? "text-sm leading-6" : "line-clamp-2 font-serif text-base font-semibold leading-6"}>{item.title}</h3>
          {!isMood && item.description ? (
            <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--muted-ink)]">{item.description}</p>
          ) : null}
        </div>
      </div>
      {!isMood && item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="mt-3 aspect-[16/9] w-full rounded-2xl object-cover" />
      ) : null}
    </article>
  );
}

export function HomeOverview({
  recentMemories,
  currentUserId,
  authorNames,
}: {
  recentMemories: MemoryItem[];
  currentUserId: string;
  authorNames: Record<string, string>;
}) {
  return (
    <section className="cos-card flex flex-col p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs tracking-[0.22em] text-[var(--muted-ink)]">RECENT STORIES</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold">最近的我们</h2>
        </div>
      </div>

      {recentMemories.length ? (
        <div data-testid="recent-story-line" className="relative mt-6 flex-1 overflow-hidden pb-2">
          <div aria-hidden="true" className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-[linear-gradient(to_bottom,transparent,var(--rose)_10%,var(--line)_90%,transparent)] opacity-45" />
          <div className="grid gap-5">
            {recentMemories.map((item) => {
              const isMine = item.authorId === currentUserId;
              const authorName = item.authorId ? authorNames[item.authorId] ?? "伴侣" : "我们";
              return (
                <div key={`${item.kind}-${item.id}`} className="relative grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-start">
                  <div className={isMine ? "pr-3" : "col-start-3 pl-3"}>
                    <StoryCard item={item} authorName={authorName} />
                  </div>
                  <span aria-hidden="true" className="absolute left-1/2 top-5 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border border-white bg-[var(--paper-deep)] text-xs shadow-sm">
                    {item.kind === "mood" ? "✦" : "♡"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center py-16 text-center text-sm text-[var(--muted-ink)]">
          <p>最近还没有新的回忆或心情。</p>
        </div>
      )}
      <Link href="/memories" className="mx-auto mt-5 flex min-h-11 items-center gap-1 text-sm text-[var(--rose)]">
        查看全部回忆与心情 <ArrowRight aria-hidden="true" size={15} />
      </Link>
    </section>
  );
}
