import { BodyPreview, EmptyPersonalState, formatDate, LoadMore, PersonalCard, PersonalPageHeader } from "@/features/personal-center/components/PersonalCards";
import { PublishedLetterActions } from "@/features/personal-center/components/PersonalActions";
import { getMyPublishedLetters } from "@/features/personal-center/queries";

export default async function MyLettersPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const params = await searchParams;
  const page = await getMyPublishedLetters({ cursor: params.cursor });

  return (
    <div>
      <PersonalPageHeader title="我的日记" intro="这里放你已经寄出的今日信和已送达的时间胶囊。发布后的正文不可编辑，24小时内可以撤回。" />
      <div className="space-y-4">
        {page.items.length === 0 ? <EmptyPersonalState>还没有已经寄出的信。</EmptyPersonalState> : null}
        {page.items.map((item) => (
          <PersonalCard key={item.id}>
            <p className="text-sm text-[var(--muted-ink)]">{formatDate(item.publishedAt)}</p>
            <h2 className="mt-2 text-xl font-semibold">{item.letterDate} 的信</h2>
            {item.finalLine ? <p className="mt-2 text-[var(--rose-ink)]">总而言之，我想跟你说：{item.finalLine}</p> : null}
            <BodyPreview text={item.bodyText} />
            <PublishedLetterActions id={item.id} version={item.version} href={item.href} canWithdraw={item.canWithdraw} />
          </PersonalCard>
        ))}
      </div>
      <LoadMore href={page.nextCursor ? `/me/letters?cursor=${page.nextCursor}` : null} />
    </div>
  );
}
