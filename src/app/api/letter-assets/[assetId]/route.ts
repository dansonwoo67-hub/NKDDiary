import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

function notFound() {
  return new Response(null, { status: 404, headers: noStoreHeaders });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return notFound();
  const { assetId } = await context.params;
  if (!z.uuid().safeParse(assetId).success) return notFound();

  const { data: asset, error } = await supabase
    .from("letter_assets")
    .select("storage_path")
    .eq("id", assetId)
    .eq("upload_status", "ready")
    .maybeSingle();
  // The asset SELECT policy is the visibility decision. It denies withdrawn
  // letters and private drafts belonging to another person.
  if (error || !asset?.storage_path) return notFound();

  const { data, error: signingError } = await supabase.storage
    .from("letter-images")
    .createSignedUrl(asset.storage_path, 60);
  if (signingError || !data?.signedUrl) return notFound();

  let target: URL;
  let trustedOrigin: string;
  try {
    target = new URL(data.signedUrl);
    trustedOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return notFound();
  }
  if (target.protocol !== "https:" || target.origin !== trustedOrigin) {
    return notFound();
  }

  return new Response(null, {
    status: 302,
    headers: { ...noStoreHeaders, Location: target.toString() },
  });
}
