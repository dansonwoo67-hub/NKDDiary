import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { signOutAction } from "@/features/auth/actions";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { APP_NAVIGATION } from "@/features/home/navigation";

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
      <nav aria-label="主导航" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white/60 px-4 py-3 text-sm text-[var(--ink)] shadow-sm backdrop-blur">
        <Link href="/" className="font-semibold">
          NKD Diary
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {APP_NAVIGATION.map((item) => (
            <Link key={item.label} href={item.href} className="rounded-full px-3 py-1.5 transition hover:bg-white/80">
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">{profile.display_name}</span>
          <NotificationBell />
          <form action={signOutAction}>
            <button className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-white" type="submit">
              退出
            </button>
          </form>
        </div>
      </nav>
      {children}
    </main>
  );
}
