import { redirect } from "next/navigation";
import { cache } from "react";
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

export const requireUser = cache(async function requireUser(): Promise<{ userId: string; profile: Profile }> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    redirect("/login");
  }

  return { userId, profile: profile as Profile };
});
