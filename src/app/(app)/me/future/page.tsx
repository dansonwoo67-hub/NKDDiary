import { BodyPreview, EmptyPersonalState, formatDate, LoadMore, PersonalCard, PersonalPageHeader } from "@/features/personal-center/components/PersonalCards";
import { FutureLetterActions } from "@/features/personal-center/components/PersonalActions";
import { getMyFutureLetters } from "@/features/personal-center/queries";

export default async function MyFuturePage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const params = await searchParams;
  const page = await getMyFutureLetters({ cursor: params.cursor });

  return (
    <div>
      <PersonalPageHeader title="给未来" intro="这些信还没送达，对方暂时看不到。你可以改期、退回草稿箱或删除。" />
      <div className="space-y-4">
        {page.items.length === 0 ? <EmptyPersonalState>现在没有等待送达的时间胶囊。</EmptyPersonalState> : null}
        {page.items.map((item) => (
          <PersonalCard key={item.id}>
            <p className="text-sm text-[var(--muted-ink)]">将在 {formatDate(item.scheduledFor)} 送达</p>
            <h2 className="mt-2 text-xl font-semibold">{item.letterDate} 的时间胶囊</h2>
            {item.finalLine ? <p className="mt-2 text-[var(--rose-ink)]">总而言之，我想跟你说：{item.finalLine}</p> : null}
            <BodyPreview text={item.bodyText} />
            <FutureLetterActions id={item.id} version={item.version} scheduledFor={item.scheduledFor} />
          </PersonalCard>
        ))}
      </div>
      <LoadMore href={page.nextCursor ? `/me/future?cursor=${page.nextCursor}` : null} />
    </div>
  );
}
