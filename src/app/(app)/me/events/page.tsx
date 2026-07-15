import { EmptyPersonalState, formatDate, LoadMore, PersonalCard, PersonalPageHeader } from "@/features/personal-center/components/PersonalCards";
import { getMyEvents } from "@/features/personal-center/queries";

const recurrenceLabel = {
  none: "不循环",
  monthly: "每月提醒",
  yearly: "每年提醒",
};

export default async function MyEventsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const params = await searchParams;
  const page = await getMyEvents({ cursor: params.cursor });

  return (
    <div>
      <PersonalPageHeader title="事件" intro="你在日历中标记的提醒会在这里汇总，双方都能在日历上看到。" />
      <div className="space-y-4">
        {page.items.length === 0 ? <EmptyPersonalState>还没有创建日历事件。</EmptyPersonalState> : null}
        {page.items.map((item) => (
          <PersonalCard key={item.id}>
            <p className="text-sm text-[var(--muted-ink)]">{formatDate(item.eventDate)}</p>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold">
              <span>{item.icon}</span>
              <span>{item.name}</span>
            </h2>
            <p className="mt-3 text-sm text-[var(--muted-ink)]">{recurrenceLabel[item.recurrence]}</p>
          </PersonalCard>
        ))}
      </div>
      <LoadMore href={page.nextCursor ? `/me/events?cursor=${page.nextCursor}` : null} />
    </div>
  );
}
