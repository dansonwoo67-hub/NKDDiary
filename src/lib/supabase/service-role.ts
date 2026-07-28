import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

/**
 * Creates the narrowly used server-only client for validated comment writes.
 * Importing next/headers makes this module unavailable to Client Components.
 */
export async function createServiceRoleSupabaseClient() {
  await headers();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
