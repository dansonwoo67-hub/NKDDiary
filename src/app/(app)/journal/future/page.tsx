import Link from "next/link";
import { FutureDiaryCard } from "@/features/journal/components/FutureDiaryCard";
import { JournalTabs } from "@/features/journal/components/JournalTabs";
import { deriveFutureState } from "@/features/journal/domain";
import {
  getFutureDiaryRecipient,
  listFutureDiaryCards,
  listSentFutureDiaryEntries,
} from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type FutureDiaryPageProps = {
  searchParams: Promise<{ box?: string }>;
};

export default async function FutureDiaryPage({ searchParams }: FutureDiaryPageProps) {
  const [{ box }, currentUser, supabase] = await Promise.all([
    searchParams,
    requireUser(),
    createServerSupabaseClient(),
  ]);
  const activeBox = box === "sent" ? "sent" : "received";
  const partner = await getFutureDiaryRecipient(supabase, {
    userId: currentUser.userId,
    spaceId: currentUser.spaceId,
  });

  const entries = activeBox === "received"
    ? await listFutureDiaryCards(supabase, { userId: currentUser.userId, box: "received" })
    : await listSentFutureDiaryEntries(supabase, currentUser.userId);

  return (
    <div className="grid gap-6">
      <JournalTabs active="future" />
      <header className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">TIME CAPSULES</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold text-[var(--ink)]">
            {activeBox === "received" ? "收到的未来日记" : "我写出的未来日记"}
          </h1>
          <Link href="/journal/future/new" className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm text-white">
            写一篇未来日记
          </Link>
        </div>
        <nav aria-label="未来日记筛选" className="mt-5 flex gap-2">
          <Link href="/journal/future?box=received" aria-current={activeBox === "received" ? "page" : undefined} className="rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)]">收到的</Link>
          <Link href="/journal/future?box=sent" aria-current={activeBox === "sent" ? "page" : undefined} className="rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)]">我写出的</Link>
        </nav>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-2xl bg-white/55 px-4 py-3 text-sm text-[var(--muted-ink)]">
          {activeBox === "received" ? "还没有收到未来日记。" : "还没有写出的未来日记。"}
        </p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2" aria-label={activeBox === "received" ? "收到的未来日记列表" : "我写出的未来日记列表"}>
          {activeBox === "received"
            ? entries.map((entry) => {
                if (!("state" in entry)) return null;
                return <FutureDiaryCard key={entry.id} role="recipient" entry={{
                  id: entry.id,
                  authorName: partner?.displayName ?? "对方",
                  state: entry.state,
                  sealedAt: entry.sealedAt,
                  openAt: entry.openAt,
                  openedAt: entry.openedAt,
                }} />;
              })
            : entries.map((entry) => {
                if (!("content" in entry) || !entry.openAt || !entry.sealedAt) return null;
                return <FutureDiaryCard key={entry.id} role="author" entry={{
                  id: entry.id,
                  recipientName: partner?.displayName ?? "对方",
                  state: deriveFutureState({ openAt: entry.openAt, openedAt: entry.openedAt }),
                  sealedAt: entry.sealedAt,
                  openAt: entry.openAt,
                  openedAt: entry.openedAt,
                  title: entry.title,
                  excerpt: entry.content.slice(0, 160),
                }} />;
              })}
        </section>
      )}
    </div>
  );
}
