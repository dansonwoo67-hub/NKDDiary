import Link from "next/link";

type JournalCardProps = {
  href: string;
  title: string;
  description: string;
  actionLabel: string;
};

export function JournalCard({ href, title, description, actionLabel }: JournalCardProps) {
  return (
    <article className="hand-card rounded-[2rem] p-6">
      <h2 className="text-2xl font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-3 leading-7 text-[var(--muted-ink)]">{description}</p>
      <Link href={href} className="mt-5 inline-flex rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)]">
        {actionLabel}
      </Link>
    </article>
  );
}
