import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { signOutAction } from "@/features/auth/actions";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>;
}

async function AuthenticatedAppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">
      <nav className="mb-6 flex items-center justify-between rounded-full bg-white/50 px-4 py-3 text-sm text-[var(--ink)] shadow-sm">
        <Link href="/" className="font-semibold">
          NKD Diary
        </Link>
        <div className="flex items-center gap-3">
          <span>{profile.display_name}</span>
          <Link href="/write" className="rounded-full bg-white/70 px-3 py-1">
            写信
          </Link>
          <Link href="/settings" className="rounded-full bg-white/70 px-3 py-1">
            设置
          </Link>
          <form action={signOutAction}>
            <button className="rounded-full bg-[var(--ink)] px-3 py-1 text-white" type="submit">
              退出
            </button>
          </form>
        </div>
      </nav>
      {children}
    </main>
  );
}
