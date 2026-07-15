import { BookmarkActions } from "@/features/personal-center/components/PersonalActions";
import { EmptyPersonalState, formatDate, LoadMore, PersonalCard, PersonalPageHeader } from "@/features/personal-center/components/PersonalCards";
import { getMyBookmarks } from "@/features/personal-center/queries";

export default async function MyBookmarksPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const params = await searchParams;
  const page = await getMyBookmarks({ cursor: params.cursor });

  return (
    <div>
      <PersonalPageHeader title="收藏" intro="整封信和文字片段都会收在这里。原信撤回后，片段仍保留当时的引用快照。" />
      <div className="space-y-4">
        {page.items.length === 0 ? <EmptyPersonalState>还没有收藏内容。</EmptyPersonalState> : null}
        {page.items.map((item) => (
          <PersonalCard key={item.id}>
            <p className="text-sm text-[var(--muted-ink)]">{formatDate(item.createdAt)}</p>
            <h2 className="mt-2 text-xl font-semibold">{item.kind === "letter" ? "整封信" : "文字片段"}</h2>
            {item.letterStatus === "withdrawn" && item.kind === "letter" ? (
              <p className="mt-3 text-sm text-[var(--muted-ink)]">原信已撤回。</p>
            ) : item.quotedText ? (
              <blockquote className="mt-3 border-l-2 border-[rgb(174_78_94_/_45%)] pl-3 text-sm leading-7 text-[var(--muted-ink)]">“{item.quotedText}”</blockquote>
            ) : null}
            <BookmarkActions id={item.id} href={item.letterStatus === "withdrawn" ? null : item.href} />
          </PersonalCard>
        ))}
      </div>
      <LoadMore href={page.nextCursor ? `/me/bookmarks?cursor=${page.nextCursor}` : null} />
    </div>
  );
}
