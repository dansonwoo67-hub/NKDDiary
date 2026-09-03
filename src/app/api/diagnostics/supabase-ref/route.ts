const SUPABASE_HOSTNAME = /^([a-z0-9]{20})\.supabase\.co$/;

function notFound() {
  return new Response(null, { status: 404 });
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return notFound();
  }

  try {
    const hostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    const projectRef = SUPABASE_HOSTNAME.exec(hostname)?.[1];

    if (!projectRef) {
      return notFound();
    }

    return Response.json(
      { environment: "preview", supabaseProjectRef: projectRef },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return notFound();
  }
}
