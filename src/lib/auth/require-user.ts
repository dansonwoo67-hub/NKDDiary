import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  login_name: string;
  display_name: string;
  avatar_url: string | null;
  partner_nickname: string | null;
  last_login_at: string | null;
  last_login_latitude: number | null;
  last_login_longitude: number | null;
  relationship_started_on: string;
  display_preferences: { compactCalendar?: boolean };
  created_at: string;
  updated_at: string;
};

export type MembershipRow = {
  user_id: string;
  space_id: string;
  active: boolean;
};

const PRIVATE_SPACE_ACCESS_ERROR = "无权访问这个私人空间";

export function assertLegacyCoupleMembership(appMetadata: unknown): void {
  const isLegacyMember =
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    "nkd_diary_member" in appMetadata &&
    appMetadata.nkd_diary_member === "true";

  if (!isLegacyMember) {
    throw new Error(PRIVATE_SPACE_ACCESS_ERROR);
  }
}

export function resolveMembership(userId: string, rows: MembershipRow[]) {
  const memberships = rows.filter((row) => row.user_id === userId && row.active);

  if (memberships.length !== 1) {
    throw new Error(PRIVATE_SPACE_ACCESS_ERROR);
  }

  const [membership] = memberships;
  return { userId, spaceId: membership.space_id };
}

export async function requireUser(): Promise<{ userId: string; profile: Profile; spaceId: string; email: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const { data: userData } = await supabase.auth.getUser();
  const userId = claimsData?.claims?.sub;
  const email = userData?.user?.email ?? "";

  if (claimsError || !userId) {
    redirect("/login");
  }

  assertLegacyCoupleMembership(claimsData?.claims?.app_metadata);

  const { data: memberships, error: membershipError } = await supabase
    .from("space_members")
    .select("user_id, space_id, active")
    .eq("user_id", userId);

  if (membershipError) {
    throw new Error(PRIVATE_SPACE_ACCESS_ERROR);
  }

  const membership = resolveMembership(userId, (memberships ?? []) as MembershipRow[]);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    redirect("/login");
  }

  return { userId, profile: profile as Profile, spaceId: membership.spaceId, email };
}
