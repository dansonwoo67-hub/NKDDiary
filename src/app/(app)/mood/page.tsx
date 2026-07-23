import { createMoodFromForm, listRecentMoods } from "@/features/mood/actions";

export default async function MoodPage() {
  const moods = await listRecentMoods();
  return <div className="grid gap-6">
    <section className="hand-card rounded-[2rem] p-6">
      <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">MOOD</p>
      <h1 className="mt-2 text-3xl font-semibold">我们此刻的心情</h1>
      <form action={createMoodFromForm} className="mt-5 grid gap-3 sm:grid-cols-[7rem_1fr_auto]">
        <input name="emoji" maxLength={8} placeholder="🥰" aria-label="心情表情" className="rounded-2xl border bg-white/70 px-4 py-3" />
        <input name="text" maxLength={140} placeholder="写下一点此刻的感受" aria-label="心情文字" className="rounded-2xl border bg-white/70 px-4 py-3" />
        <button type="submit" className="rounded-full bg-[var(--ink)] px-5 py-3 text-white">记下来</button>
      </form>
    </section>
    <section className="grid gap-3" aria-label="最近心情">
      {moods.map((mood) => {
        const profile = Array.isArray(mood.profiles) ? mood.profiles[0] : mood.profiles;
        return <article key={String(mood.id)} className="hand-card rounded-3xl p-5">
          <p className="text-lg">{String(mood.emoji)} {String(mood.body)}</p>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">{profile && typeof profile === "object" && "display_name" in profile ? String(profile.display_name) : "我们"} · {new Date(String(mood.created_at)).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
        </article>;
      })}
    </section>
  </div>;
}
