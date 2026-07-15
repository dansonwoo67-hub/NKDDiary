import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/202607130002_letter_assets_bookmarks.sql"),
  "utf8",
).toLowerCase();
const normalizedSql = sql.replace(/\s+/g, " ");
const imageCoreSource = readFileSync(
  join(process.cwd(), "src/features/letters/editor/image-actions-core.ts"),
  "utf8",
);
const imageButtonSource = readFileSync(
  join(process.cwd(), "src/features/letters/editor/ImageUploadButton.tsx"),
  "utf8",
);

describe("private letter image storage migration", () => {
  it("keeps the bucket private and restricted to compressed WebP", () => {
    expect(sql).toContain("'letter-images',\n  'letter-images',\n  false");
    expect(sql).toContain("array['image/webp']");
  });

  it("uses owner_id and keeps uploading-object SELECT available only to the active author", () => {
    expect(sql).toContain("owner_id = (select auth.uid())::text");
    expect(sql).toContain("asset.upload_status = 'ready'");
    expect(sql).toMatch(
      /asset\.owner_id = \(select auth\.uid\(\)\)[\s\S]{0,180}parent_letter\.status in \('draft', 'scheduled'\)/,
    );
  });

  it("does not expose service credentials or a public storage policy", () => {
    expect(sql).not.toContain("service_role");
    expect(sql).not.toMatch(/for select to (anon|public)/);
  });

  it("uses the authenticated Storage INSERT path instead of an RLS-bypassing signed upload", () => {
    expect(imageCoreSource).not.toContain("createSignedUploadUrl");
    expect(imageButtonSource).not.toContain("uploadToSignedUrl");
    expect(imageButtonSource).toContain('.upload(path, file, { contentType: "image/webp", upsert: false })');
    expect(sql).toContain("private.can_upload_letter_image(name)");
  });

  it("prevents direct inserts or updates from declaring an asset ready", () => {
    const insertGrant = sql.match(
      /grant insert \(([\s\S]*?)\) on public\.letter_assets to authenticated;/,
    )?.[1];
    expect(insertGrant).toBeDefined();
    expect(insertGrant).not.toContain("upload_status");
    expect(sql).not.toMatch(
      /grant update \([\s\S]*?\) on public\.letter_assets to authenticated;/,
    );
    expect(sql).toContain("create function public.fail_letter_image_upload(");
    expect(sql).toContain("asset_row.upload_status not in ('uploading', 'failed')");
    expect(sql).toContain("if asset_row.upload_status = 'failed' then");
    expect(sql).toContain("set upload_status = 'failed'");
    expect(normalizedSql).toContain(
      "grant execute on function public.fail_letter_image_upload(uuid, text) to authenticated",
    );
  });

  it("allows ready transitions only through a locked metadata-verifying RPC", () => {
    expect(sql).toContain("create function public.complete_letter_image_upload(");
    expect(sql).toContain("security definer\nset search_path = pg_catalog");
    expect(sql).toContain("stored_object.owner_id = caller_id::text");
    expect(sql).toContain("object_row.metadata ->> 'mimetype'");
    expect(sql).toContain("object_row.metadata ->> 'size'");
    expect(sql).toContain("object_size_text::numeric <> asset_row.size_bytes");
    expect(sql).toContain("asset_row.upload_status not in ('uploading', 'ready')");
    expect(normalizedSql).toContain(
      "grant execute on function public.complete_letter_image_upload(uuid, text) to authenticated",
    );
    expect(normalizedSql).toContain(
      "revoke all on function public.complete_letter_image_upload(uuid, text) from public, anon, authenticated",
    );
  });

  it("permits Storage deletion only after the controlled failed transition", () => {
    const updatePolicy = sql.match(
      /create policy "authors can update active letter images"([\s\S]*?)create policy "authors can delete active letter images"/,
    )?.[1];
    const deletePolicy = sql.match(
      /create policy "authors can delete active letter images"([\s\S]*?)commit;/,
    )?.[1];
    expect(updatePolicy).toContain("asset.upload_status in ('uploading', 'failed')");
    expect(deletePolicy).toContain("asset.upload_status = 'failed'");
    expect(deletePolicy).not.toContain("asset.upload_status in ('uploading', 'failed')");
  });

  it("makes completion idempotent only after rechecking the ready asset and object", () => {
    expect(sql).toContain("asset_row.upload_status not in ('uploading', 'ready')");
    expect(normalizedSql).toContain(
      "asset_row.upload_status = 'ready' and parent_letter.status = 'published'",
    );
    expect(sql).toContain("if asset_row.upload_status = 'ready' then");
    expect(sql).toContain("return true;");
  });

  it("uses a recoverable two-phase RPC flow for deleting private letters and objects", () => {
    expect(sql).toContain("create function public.prepare_private_letter_deletion(");
    expect(sql).toContain("create function public.finalize_private_letter_deletion(");
    expect(sql).toContain("set upload_status = 'failed'");
    expect(sql).toContain("deletion_token uuid");
    expect(sql).toContain("deletion_pending_at timestamptz");
    expect(sql).toContain("old.deletion_token is not null");
    expect(sql).toContain("parent_letter.deletion_token is null");
    expect(sql).toContain("p_deletion_token uuid");
    expect(sql).toContain("letter_row.deletion_token = p_deletion_token");
    expect(sql).toContain("letter_id uuid references public.letters(id) on delete set null");
    expect(sql).toContain("asset.upload_status = 'failed'");
    expect(normalizedSql).toContain(
      "grant execute on function public.prepare_private_letter_deletion(uuid, integer) to authenticated",
    );
    expect(normalizedSql).toContain(
      "grant execute on function public.finalize_private_letter_deletion(uuid, uuid) to authenticated",
    );
  });
});
