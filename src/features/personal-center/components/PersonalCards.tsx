import Link from "next/link";
import type { ReactNode } from "react";

export function PersonalPageHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <header className="mb-6">
      <p className="text-sm tracking-[0.22em] text-[var(--muted-ink)]">资料库</p>
      <h1 className="mt-2 text-3xl font-semibold text-[var(--ink)]">{title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-7 text-[var(--muted-ink)]">{intro}</p>
    </header>
  );
}

export function PersonalCard({ children }: { children: ReactNode }) {
  return (
    <article className="rounded-[1.5rem] border border-[rgb(71_56_45_/_12%)] bg-white/55 p-5 shadow-[0_14px_38px_rgb(83_61_43_/_10%)]">
      {children}
    </article>
  );
}

export function EmptyPersonalState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[rgb(71_56_45_/_20%)] bg-white/35 p-6 text-sm leading-7 text-[var(--muted-ink)]">
      {children}
    </div>
  );
}

export function LoadMore({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <div className="mt-6">
      <Link href={href} className="inline-flex rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)] hover:bg-white">
        继续翻看
      </Link>
    </div>
  );
}

export function BodyPreview({ text }: { text: string }) {
  return <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-[var(--muted-ink)]">{text || "还没有正文。"}</p>;
}

export function formatDate(value: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: value.includes("T") ? "2-digit" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined,
  }).format(date);
}
