import { getMonthCalendarState } from "@/features/calendar/actions";
import { EventDialog } from "@/features/calendar/components/EventDialog";
import { MonthHeatmap } from "@/features/home/components/MonthHeatmap";

export default async function CalendarPage() {
  const now = new Date();
  const state = await getMonthCalendarState(now.getFullYear(), now.getMonth() + 1);

  return (
    <div className="grid gap-6">
      <section className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.3em] text-[var(--muted-ink)]">CALENDAR</p>
        <h1 className="mt-3 text-3xl font-semibold">共同生活日历</h1>
        <p className="mt-3 text-sm text-[var(--muted-ink)]">事件双方都能看见，可以设置不循环、每月或每年提醒。</p>
      </section>
      <EventDialog defaultDate={new Date().toISOString().slice(0, 10)} />
      <MonthHeatmap state={state} />
    </div>
  );
}
