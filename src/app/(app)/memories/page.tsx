import Link from "next/link";
import { listMemories } from "@/features/memories/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MemoriesPage() {
  const [{ spaceId }, supabase] = await Promise.all([requireUser(), createServerSupabaseClient()]);
  const memories = await listMemories(supabase, spaceId);
  return <div className="grid gap-6">
    <header className="hand-card rounded-[2rem] p-6">
      <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">MEMORIES</p>
      <h1 className="mt-2 text-3xl font-semibold">我们的回忆</h1>
      <p className="mt-3 text-sm text-[var(--muted-ink)]">日记、已开启的未来日记、心情和共同日历，按时间汇聚在这里。</p>
    </header>
    <section className="grid gap-3" aria-label="回忆时间线">
      {memories.map((memory) => <article key={`${memory.kind}-${memory.id}`} className="hand-card rounded-3xl p-5">
        <p className="text-xs uppercase tracking-widest text-[var(--muted-ink)]">{memory.kind}</p>
        {memory.href ? <Link className="mt-2 block text-lg font-medium" href={memory.href}>{memory.title}</Link> : <p className="mt-2 text-lg">{memory.title}</p>}
        <time className="mt-2 block text-xs text-[var(--muted-ink)]">{new Date(memory.occurredAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time>
      </article>)}
      {memories.length === 0 && <p className="rounded-2xl bg-white/55 p-4 text-sm text-[var(--muted-ink)]">从今天开始留下第一份回忆吧。</p>}
    </section>
  </div>;
}
