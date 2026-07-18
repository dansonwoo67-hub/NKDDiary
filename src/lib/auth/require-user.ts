import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  login_name: string;
  display_name: string;
  avatar_url: string | null;
  last_login_at: string | null;
  last_login_latitude: number | null;
  last_login_longitude: number | null;
  relationship_started_on: string;
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
  const membership = rows.find((row) => row.user_id === userId && row.active);

  if (!membership) {
    throw new Error(PRIVATE_SPACE_ACCESS_ERROR);
  }

  return { userId, spaceId: membership.space_id };
}

/**
 * The deployed schema still authorizes the couple through profile RLS and the
 * `nkd_diary_member` JWT claim. Task 2 will replace this transitional ID with
 * a real active membership query and pass its rows through `resolveMembership`.
 */
const LEGACY_COUPLE_SPACE_ID = process.env.COUPLE_LEGACY_SPACE_ID ?? "legacy-couple-space";

export async function requireUser(): Promise<{ userId: string; profile: Profile; spaceId: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  assertLegacyCoupleMembership(claimsData?.claims?.app_metadata);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    redirect("/login");
  }

  return { userId, profile: profile as Profile, spaceId: LEGACY_COUPLE_SPACE_ID };
}
