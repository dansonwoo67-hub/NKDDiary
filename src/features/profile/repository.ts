import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileClient = Pick<SupabaseClient, "from">;
export const ACTIVE_SPACE_PROFILE_FIELDS = "id, display_name, avatar_url, last_login_latitude, last_login_longitude";
export type SpaceProfile = {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  last_login_latitude?: number | null;
  last_login_longitude?: number | null;
};

export async function listActiveSpaceProfiles(client: ProfileClient, spaceId: string): Promise<SpaceProfile[]> {
  const { data: memberships, error: membershipError } = await client.from("space_members")
    .select("user_id").eq("space_id", spaceId).eq("active", true);
  if (membershipError) throw new Error("Unable to load active space members");
  const userIds = (memberships ?? []).map((row) => String(row.user_id));
  if (userIds.length === 0) return [];
  const { data, error } = await client.from("profiles").select(ACTIVE_SPACE_PROFILE_FIELDS).in("id", userIds);
  if (error) throw new Error("Unable to load active space profiles");
  return (data ?? []) as unknown as SpaceProfile[];
}
