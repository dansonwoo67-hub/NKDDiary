import { CalendarDays, Camera, Heart, Sparkles } from "lucide-react";
import { MemoryTimeline } from "@/features/memories/components/MemoryTimeline";
import { GramophonePlayer } from "@/features/memories/components/GramophonePlayer";
import { CursorSparkles } from "@/features/memories/components/CursorSparkles";
import { listMemories } from "@/features/memories/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MemoriesPage() {
  const [{ spaceId, userId }, supabase] = await Promise.all([
    requireUser(),
    createServerSupabaseClient(),
  ]);
  const memories = await listMemories(supabase, spaceId);
  const counts = {
    total: memories.length,
    memories: memories.filter((item) => item.kind === "memory").length,
    moods: memories.filter((item) => item.kind === "mood").length,
    dates: memories.filter((item) => item.kind === "calendar").length,
  };

  return (
    <div className="grid gap-7">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.22em] text-[var(--rose)]">MEMORIES</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">我们的回忆</h1>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">全部回忆与共享文字心情，都按时间留在这里。</p>
        </div>
      </header>

      <section className="grid gap-3 rounded-[1.5rem] bg-[linear-gradient(110deg,var(--rose),var(--orange))] p-5 text-white sm:grid-cols-4 sm:p-7">
        <h2 className="font-serif text-xl font-semibold sm:col-span-4">已经留下的片段</h2>
        {[
          { label: "全部", value: counts.total, Icon: Heart },
          { label: "回忆", value: counts.memories, Icon: Camera },
          { label: "心情", value: counts.moods, Icon: Sparkles },
          { label: "纪念日", value: counts.dates, Icon: CalendarDays },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl bg-white/12 px-4 py-3">
            <Icon aria-hidden="true" size={16} className="mb-2 text-white/75" />
            <strong className="block text-2xl">{value}</strong>
            <span className="text-xs text-white/75">{label}</span>
          </div>
        ))}
      </section>

      <MemoryTimeline items={memories} viewerId={userId} />
      <GramophonePlayer />
      <CursorSparkles />
    </div>
  );
}
