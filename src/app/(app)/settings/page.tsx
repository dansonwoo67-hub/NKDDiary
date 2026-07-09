import { requireUser } from "@/lib/auth/require-user";
import { ProfileForm } from "@/features/profile/components/ProfileForm";

export default async function SettingsPage() {
  const { profile } = await requireUser();

  return <ProfileForm profile={profile} />;
}
