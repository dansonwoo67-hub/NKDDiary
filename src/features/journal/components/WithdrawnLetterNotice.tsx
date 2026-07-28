import Link from "next/link";

export function WithdrawnLetterNotice() {
  return (
    <section className="hand-card mx-auto max-w-3xl rounded-[2rem] p-8 text-center">
      <div className="text-4xl" aria-hidden="true">💌</div>
      <h1 className="mt-4 text-xl font-semibold text-[var(--ink)]">
        这封信已经被对方撤回
      </h1>
      <Link
        href="/journal"
        className="mt-6 inline-flex rounded-full bg-white/70 px-4 py-2 text-sm text-[var(--ink)]"
      >
        返回信箱
      </Link>
    </section>
  );
}
