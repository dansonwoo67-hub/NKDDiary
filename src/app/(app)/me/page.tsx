import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { personalSections } from "@/features/personal-center/components/PersonalCenterNav";
import { getMyBookmarks, getMyComments, getMyDrafts, getMyEvents, getMyFutureLetters, getMyPublishedLetters } from "@/features/personal-center/queries";

export default async function PersonalCenterPage() {
  const { profile } = await requireUser();
  const [letters, drafts, future, comments, bookmarks, events] = await Promise.all([
    getMyPublishedLetters({ limit: 3 }),
    getMyDrafts({ limit: 3 }),
    getMyFutureLetters({ limit: 3 }),
    getMyComments({ limit: 3 }),
    getMyBookmarks({ limit: 3 }),
    getMyEvents({ limit: 3 }),
  ]);
  const counts = [letters, drafts, future, comments, bookmarks, events].map((page) => page.items.length);

  return (
    <div>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white text-2xl shadow-sm">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />
            ) : (
              "♡"
            )}
          </div>
          <div>
            <p className="text-sm tracking-[0.22em] text-[var(--muted-ink)]">个人中心</p>
            <h1 className="mt-1 text-3xl font-semibold text-[var(--ink)]">{profile.display_name} 的资料库</h1>
          </div>
        </div>
        <Link href="/settings" className="self-start rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)] hover:bg-white sm:self-auto">
          编辑资料
        </Link>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {personalSections.map((section, index) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="rounded-[1.5rem] border border-[rgb(71_56_45_/_12%)] bg-white/55 p-5 transition hover:-translate-y-0.5 hover:bg-white motion-reduce:transform-none">
              <Icon aria-hidden="true" className="h-5 w-5 text-[var(--rose-ink)]" />
              <h2 className="mt-4 text-lg font-semibold">{section.label}</h2>
              <p className="mt-1 text-sm text-[var(--muted-ink)]">{section.description}</p>
              <p className="mt-5 text-sm font-medium text-[var(--ink)]">最近 {counts[index]} 条</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
