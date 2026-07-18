import Link from "next/link";
import { LetterEntryModal } from "@/features/letters/editor/LetterEntryModal";
import { getWritingEntryForLetterId } from "@/features/letters/queries";
import { requireUser } from "@/lib/auth/require-user";

export default async function ResumeLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { userId }] = await Promise.all([params, requireUser()]);
  const entry = await getWritingEntryForLetterId({ userId, id });

  return (
    <section className="hand-card grid min-h-[24rem] place-items-center rounded-[2rem] p-6 text-center">
      <div>
        <p className="text-sm tracking-[0.2em] text-[var(--muted-ink)]">继续写</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">把没说完的话接上</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--muted-ink)]">
          只有还在草稿箱里的信可以继续编辑。
        </p>
        <div className="mt-7">
          <LetterEntryModal entry={entry} recoveryOwnerId={userId} initiallyOpen />
        </div>
        <Link href="/me/drafts" className="mt-5 inline-block text-sm text-[var(--muted-ink)] underline decoration-[rgb(139_117_100_/_35%)] underline-offset-4">
          回到草稿箱
        </Link>
      </div>
    </section>
  );
}
