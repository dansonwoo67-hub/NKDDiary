export type AvatarPoint = {
  displayName: string;
  avatarUrl: string | null;
  x: number;
  y: number;
};

type HomeHeroProps = {
  daysTogether: number;
  distanceKm: number | null;
  distanceCopy: string;
  userA: AvatarPoint;
  userB: AvatarPoint;
};

export function HomeHero({ daysTogether, distanceKm, distanceCopy, userA, userB }: HomeHeroProps) {
  const distanceText = distanceKm === null ? "等待星球信号" : `今日距离 ${distanceKm.toFixed(1)} km`;

  return (
    <section className="hand-card relative overflow-hidden rounded-[2rem] px-6 py-8">
      <div className="absolute inset-0 opacity-70">
        <div className="absolute left-[10%] top-[12%] h-3 w-3 rounded-full bg-[var(--star)]" />
        <div className="absolute right-[18%] top-[16%] h-2 w-2 rounded-full bg-[var(--star)]" />
        <div className="absolute bottom-[-18%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[var(--planet)]" />
      </div>

      <div className="relative z-10 text-center">
        <p className="text-sm tracking-[0.3em] text-[var(--muted-ink)]">我们已经在一起</p>
        <p className="mt-2 text-6xl leading-none font-semibold">{daysTogether}</p>
        <p className="mt-2 text-lg text-[var(--muted-ink)]">天</p>
      </div>

      {[userA, userB].map((user) => (
        <div
          key={user.displayName}
          className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
          style={{ left: `${user.x}%`, top: `${user.y}%` }}
        >
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-[var(--ink)]">{user.displayName}</span>
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border border-white/80 bg-white text-lg shadow-sm">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
            ) : (
              "♡"
            )}
          </div>
        </div>
      ))}

      <p className="relative z-10 mt-10 text-center text-sm text-[var(--muted-ink)]">
        {distanceText} · {distanceCopy}
      </p>
    </section>
  );
}
