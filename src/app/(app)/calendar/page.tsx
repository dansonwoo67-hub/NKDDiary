import { HeartCalendar } from "@/features/home/components/HeartCalendar";
import { getHomeSnapshot } from "@/features/home/queries";
import { getChinaDateString } from "@/lib/date/china-day";
import { requireUser } from "@/lib/auth/require-user";

export default async function CalendarPage() {
  const { userId } = await requireUser();
  const now = new Date();
  const today = getChinaDateString(now);
  const snapshot = await getHomeSnapshot({ userId, year: now.getFullYear(), month: now.getMonth() + 1, view: "year" });
  const days = snapshot.days.map(({ date, dayOfMonth, monthLabel, heartState, envelopeCount, events }) => ({
    date,
    dayOfMonth,
    monthLabel,
    heartState,
    envelopeCount,
    events,
  }));

  return (
    <div className="grid gap-6">
      <section className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.3em] text-[var(--muted-ink)]">CALENDAR</p>
        <h1 className="mt-3 text-3xl font-semibold">共同生活日历</h1>
        <p className="mt-3 text-sm text-[var(--muted-ink)]">事件双方都能看见，可以设置不循环、每月或每年提醒。</p>
      </section>
      <HeartCalendar days={days} anchorDate={today} />
    </div>
  );
}
