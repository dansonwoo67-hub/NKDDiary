import Link from "next/link";
import { EmptyPersonalState, formatDate, LoadMore, PersonalCard, PersonalPageHeader } from "@/features/personal-center/components/PersonalCards";
import { getMyComments } from "@/features/personal-center/queries";

export default async function MyCommentsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const params = await searchParams;
  const page = await getMyComments({ cursor: params.cursor });

  return (
    <div>
      <PersonalPageHeader title="评点" intro="这里收着你发出的划线评论，以及这条评论下面的回复。" />
      <div className="space-y-4">
        {page.items.length === 0 ? <EmptyPersonalState>还没有划线评点。</EmptyPersonalState> : null}
        {page.items.map((item) => (
          <PersonalCard key={item.id}>
            <p className="text-sm text-[var(--muted-ink)]">{formatDate(item.createdAt)}</p>
            <blockquote className="mt-3 border-l-2 border-[rgb(174_78_94_/_45%)] pl-3 text-sm leading-7 text-[var(--muted-ink)]">“{item.quotedText}”</blockquote>
            <p className="mt-3 leading-7">{item.comment}</p>
            {item.replies.length > 0 ? (
              <div className="mt-3 space-y-2">
                {item.replies.map((reply) => (
                  <p key={reply.id} className="rounded-2xl bg-white/55 px-3 py-2 text-sm">
                    <span className="font-medium">{reply.authorName}：</span>{reply.body}
                  </p>
                ))}
              </div>
            ) : null}
            {item.href ? <Link href={item.href} className="mt-4 inline-flex rounded-full bg-white/70 px-3 py-2 text-sm text-[var(--ink)] hover:bg-white">跳到原文</Link> : null}
          </PersonalCard>
        ))}
      </div>
      <LoadMore href={page.nextCursor ? `/me/comments?cursor=${page.nextCursor}` : null} />
    </div>
  );
}
