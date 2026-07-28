import Link from "next/link";
import { BookOpen, Send } from "lucide-react";

export function JournalTabs({ active }: { active: "journal" | "future" }) {
  return (
    <nav aria-label="日记类型" className="inline-flex rounded-2xl border border-[var(--line)] bg-white/55 p-1">
      <Link
        href="/journal"
        aria-current={active === "journal" ? "page" : undefined}
        className="flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm text-[var(--muted-ink)] aria-[current=page]:bg-white aria-[current=page]:font-semibold aria-[current=page]:text-[var(--rose)] aria-[current=page]:shadow-sm"
      >
        <BookOpen aria-hidden="true" size={17} />
        日记
      </Link>
      <Link
        href="/journal/future"
        aria-current={active === "future" ? "page" : undefined}
        className="flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm text-[var(--muted-ink)] aria-[current=page]:bg-white aria-[current=page]:font-semibold aria-[current=page]:text-[var(--rose)] aria-[current=page]:shadow-sm"
      >
        <Send aria-hidden="true" size={17} />
        未来日记
      </Link>
    </nav>
  );
}
