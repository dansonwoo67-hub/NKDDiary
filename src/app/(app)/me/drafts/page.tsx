import { BodyPreview, EmptyPersonalState, formatDate, LoadMore, PersonalCard, PersonalPageHeader } from "@/features/personal-center/components/PersonalCards";
import { DraftLetterActions } from "@/features/personal-center/components/PersonalActions";
import { getMyDrafts } from "@/features/personal-center/queries";

export default async function MyDraftsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const params = await searchParams;
  const page = await getMyDrafts({ cursor: params.cursor });

  return (
    <div>
      <PersonalPageHeader title="草稿箱" intro="草稿会一直保存，没写完的信可以回来继续写；草稿支持删除。" />
      <div className="space-y-4">
        {page.items.length === 0 ? <EmptyPersonalState>草稿箱现在是空的。</EmptyPersonalState> : null}
        {page.items.map((item) => (
          <PersonalCard key={item.id}>
            <p className="text-sm text-[var(--muted-ink)]">最后更新 {formatDate(item.updatedAt)}</p>
            <h2 className="mt-2 text-xl font-semibold">{item.kind === "time_capsule" ? "写给未来" : item.letterDate}</h2>
            {item.finalLine ? <p className="mt-2 text-[var(--rose-ink)]">总而言之，我想跟你说：{item.finalLine}</p> : null}
            <BodyPreview text={item.bodyText} />
            <DraftLetterActions id={item.id} version={item.version} />
          </PersonalCard>
        ))}
      </div>
      <LoadMore href={page.nextCursor ? `/me/drafts?cursor=${page.nextCursor}` : null} />
    </div>
  );
}
