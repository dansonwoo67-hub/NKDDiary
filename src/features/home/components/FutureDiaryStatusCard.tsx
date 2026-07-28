import Link from "next/link";

export type HomepageFutureDiary = {
  id: string;
  authorName: string;
  state: "waiting" | "ready";
  openAt: string;
};

export function selectHomepageFutureDiary(entries: HomepageFutureDiary[]) {
  const byOpenTime = (a: HomepageFutureDiary, b: HomepageFutureDiary) => Date.parse(a.openAt) - Date.parse(b.openAt);
  return entries.filter((entry) => entry.state === "ready").sort(byOpenTime)[0]
    ?? entries.filter((entry) => entry.state === "waiting").sort(byOpenTime)[0]
    ?? null;
}

function waitingCopy(openAt: string) {
  const remaining = Math.max(0, Date.parse(openAt) - Date.now());
  const days = Math.max(1, Math.ceil(remaining / 86_400_000));
  return `${days} 天后开启`;
}

export function FutureDiaryStatusCard({ entry }: { entry: HomepageFutureDiary | null }) {
  if (!entry) return null;
  return (
    <section className="hand-card rounded-[2rem] p-6" aria-labelledby="future-status-heading">
      <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">未来日记</p>
      <h2 id="future-status-heading" className="mt-2 text-xl font-semibold">来自 {entry.authorName} 的一份约定</h2>
      <p className="mt-3 text-sm text-[var(--muted-ink)]">
        {entry.state === "ready" ? "已经可以开启" : waitingCopy(entry.openAt)}
      </p>
      <Link className="mt-4 inline-flex rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white" href="/journal/future?box=received">
        {entry.state === "ready" ? "去开启" : "查看倒计时"}
      </Link>
    </section>
  );
}
