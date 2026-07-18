"use server";

import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  cleanupDetachedLetterAssets,
  createDetachedAssetCleanupGateway,
} from "./detached-asset-cleanup";

export async function cleanupDetachedLetterAssetsAction() {
  const [{ userId }, supabase] = await Promise.all([
    requireUser(),
    createServerSupabaseClient(),
  ]);
  return cleanupDetachedLetterAssets(
    createDetachedAssetCleanupGateway(supabase),
    userId,
  );
}
