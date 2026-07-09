import { HomeHero } from "@/features/home/components/HomeHero";
import { getMonthCalendarState } from "@/features/calendar/actions";
import { MonthHeatmap } from "@/features/home/components/MonthHeatmap";

export default async function HomePage() {
  const now = new Date();
  const calendarState = await getMonthCalendarState(now.getFullYear(), now.getMonth() + 1);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <HomeHero
        daysTogether={1336}
        distanceKm={null}
        distanceCopy="等待星球信号"
        userA={{ displayName: "你", avatarUrl: null, x: 38, y: 72 }}
        userB={{ displayName: "她", avatarUrl: null, x: 62, y: 72 }}
      />

      <section className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">今日新知</p>
        <p className="mt-3 text-lg leading-8 text-[var(--ink)]">
          亲密关系里，稳定的回应比盛大的承诺更有力量。
        </p>
      </section>

      <MonthHeatmap state={calendarState} />
    </div>
  );
}
