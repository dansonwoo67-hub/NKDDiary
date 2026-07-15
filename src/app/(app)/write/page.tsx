import Link from "next/link";
import { LetterEntryModal } from "@/features/letters/editor/LetterEntryModal";
import { getTodayWritingEntry } from "@/features/letters/queries";
import { requireUser } from "@/lib/auth/require-user";

export default async function WritePage() {
  const { userId } = await requireUser();
  const writingEntry = await getTodayWritingEntry({ userId });

  return (
    <section className="hand-card grid min-h-[24rem] place-items-center rounded-[2rem] p-6 text-center">
      <div>
        <p className="text-sm tracking-[0.2em] text-[var(--muted-ink)]">写信</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">慢慢写，慢慢说</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--muted-ink)]">
          写信窗口会从这里轻轻打开，写到一半也可以先收好。
        </p>
        <div className="mt-7">
          <LetterEntryModal entry={writingEntry} recoveryOwnerId={userId} initiallyOpen />
        </div>
        <Link href="/" className="mt-5 inline-block text-sm text-[var(--muted-ink)] underline decoration-[rgb(139_117_100_/_35%)] underline-offset-4">
          回到首页
        </Link>
      </div>
    </section>
  );
}
