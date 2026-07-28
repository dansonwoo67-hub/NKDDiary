import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listActiveSpaceProfiles } from "@/features/profile/repository";
import { SettingsPageClient } from "@/features/settings/SettingsPageClient";
import { getCurrentSpaceSettings } from "@/lib/settings-actions";

export default async function SettingsPage() {
  const { profile, spaceId, userId, email } = await requireUser();
  const supabase = await createServerSupabaseClient();
  
  const [{ data: space }, profiles, settings] = await Promise.all([
    supabase.from("spaces").select("name").eq("id", spaceId).single(),
    listActiveSpaceProfiles(supabase, spaceId),
    getCurrentSpaceSettings(),
  ]);
  
  const partner = profiles.find((item) => String(item.id) !== userId);

  return (
    <SettingsPageClient
      profile={profile}
      email={email}
      spaceName={String(space?.name ?? "我们的空间")}
      partner={partner}
      settings={settings}
    />
  );
}
