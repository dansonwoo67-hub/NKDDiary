import Link from "next/link";
import { getLettersForDate } from "@/features/letters/actions";
import { LetterReader } from "@/features/letters/components/LetterReader";

type LetterDatePageProps = {
  params: Promise<{ date: string }>;
};

export default async function LetterDatePage({ params }: LetterDatePageProps) {
  const { date } = await params;
  const view = await getLettersForDate(date);

  return (
    <div className="grid gap-6">
      <section className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.3em] text-[var(--muted-ink)]">LETTER DAY</p>
        <h1 className="mt-3 text-3xl font-semibold">{view.date}</h1>
        <Link href="/write" className="mt-4 inline-flex rounded-full bg-white/70 px-4 py-2 text-sm">
          去写今天的信
        </Link>
      </section>

      {view.letters.length > 0 ? (
        view.letters.map((letter) => <LetterReader key={letter.id} letter={letter} />)
      ) : (
        <section className="hand-card rounded-[2rem] p-6 text-[var(--muted-ink)]">这一天还没有信。</section>
      )}
    </div>
  );
}
