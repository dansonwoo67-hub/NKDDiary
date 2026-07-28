-- Keep the titleless six-argument capsule RPC unambiguous for PostgREST.
-- The seven-argument overload is reserved for server-owned image uploads.
alter function public.seal_future_diary(
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  text,
  uuid
)
rename to seal_future_diary_with_image;

-- Both functions are SECURITY DEFINER entry points. Keep the titleless
-- six-argument endpoint unavailable to unauthenticated callers.
revoke execute on function public.seal_future_diary(
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  text
) from public, anon;

grant execute on function public.seal_future_diary(
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  text
) to authenticated, service_role;
