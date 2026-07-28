"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type LetterLimitStatus = {
  used_today: number;
  limit: number;
  remaining: number;
  is_limit_reached: boolean;
  reset_at: string;
};

export async function getCapsuleLetterLimitStatus(): Promise<LetterLimitStatus | null> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("get_capsule_letter_limit_status");
  if (error) {
    console.error("Failed to get capsule letter limit status:", error);
    return null;
  }
  return data as LetterLimitStatus;
}

export async function getNormalLetterLimitStatus(): Promise<LetterLimitStatus | null> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("get_normal_letter_limit_status");
  if (error) {
    console.error("Failed to get normal letter limit status:", error);
    return null;
  }
  return data as LetterLimitStatus;
}
