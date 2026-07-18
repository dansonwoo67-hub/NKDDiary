const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export const dynamic = "force-dynamic";

export function GET() {
  const instanceToken = process.env.E2E_INSTANCE_TOKEN?.trim();
  if (!instanceToken) {
    return Response.json({ error: "Not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  return Response.json(
    {
      instanceToken,
      backendUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null,
    },
    { headers: NO_STORE_HEADERS },
  );
}
