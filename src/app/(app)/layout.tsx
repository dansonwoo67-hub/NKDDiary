import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { signOutAction } from "@/features/auth/actions";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { AppBottomNav } from "@/features/home/components/AppBottomNav";
import { ProfileHeaderLink } from "@/features/profile/components/ProfileHeaderLink";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>;
}

async function AuthenticatedAppLayout({ children }: { children: React.ReactNode }) {
  const { profile, userId } = await requireUser();

  return (
    <div className="contents">
      <main className="cos-app-main">
        <header className="mb-6 flex min-h-12 items-center justify-between gap-2">
          <Link href="/" className="font-serif text-xl font-semibold tracking-tight">
            NKD Diary
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-sm max-[480px]:gap-1">
            <ProfileHeaderLink name={profile.display_name} avatarUrl={profile.avatar_url} />
            <NotificationBell userId={userId} />
            <form action={signOutAction}>
              <button className="cos-button-secondary min-h-11 px-4 max-[480px]:!px-2.5" type="submit">
                退出
              </button>
            </form>
          </div>
        </header>
        {children}
      </main>
      <AppBottomNav />
    </div>
  );
}
