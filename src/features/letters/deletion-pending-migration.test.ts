import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const assetsMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202607130002_letter_assets_bookmarks.sql"),
  "utf8",
).toLowerCase();
const schedulerMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202607130003_scheduled_publication.sql"),
  "utf8",
).toLowerCase();
const normalizedAssetsMigration = assetsMigration.replace(/\s+/g, " ");

describe("pending private-letter deletion gate", () => {
  it("atomically marks a deletion and blocks every later letter update", () => {
    expect(assetsMigration).toContain("deletion_token uuid");
    expect(assetsMigration).toContain("deletion_pending_at timestamptz");
    expect(assetsMigration).toContain("old.deletion_token is not null");
    expect(assetsMigration).toContain("letter deletion is already pending");
    expect(normalizedAssetsMigration).toContain(
      "set deletion_token = deletion_id, deletion_pending_at = now()",
    );
  });

  it("keeps scheduled publication away from letters whose deletion is pending", () => {
    expect(schedulerMigration).toContain("and letter.deletion_token is null");
  });

  it("serializes an in-flight storage insert against deletion preparation", () => {
    const uploadGate = assetsMigration.match(
      /create function private\.can_upload_letter_image\(object_name text\)([\s\S]*?)create policy "members can read visible letter images"/,
    )?.[1];
    expect(assetsMigration).toContain(
      "create function private.can_upload_letter_image(object_name text)",
    );
    expect(uploadGate).toContain("security definer\nset search_path = pg_catalog");
    expect(uploadGate).toContain("asset.storage_path = object_name");
    expect(uploadGate).toContain("asset.owner_id = (select auth.uid())");
    expect(uploadGate).toContain("asset.upload_status = 'uploading'");
    expect(uploadGate).toContain("parent_letter.status in ('draft', 'scheduled')");
    expect(uploadGate).toContain("parent_letter.deletion_token is null");
    expect(uploadGate).toContain("for share of parent_letter, asset");
    expect(uploadGate).toContain(
      "revoke all on function private.can_upload_letter_image(text)",
    );
    expect(uploadGate).toContain(
      "grant execute on function private.can_upload_letter_image(text)",
    );
    expect(assetsMigration).toContain("private.can_upload_letter_image(name)");
  });

  it("finalizes only the exact database-issued deletion token", () => {
    expect(assetsMigration).toContain("p_deletion_token uuid");
    expect(assetsMigration).toContain("parent_letter.deletion_token = p_deletion_token");
    expect(assetsMigration).toContain("letter_row.deletion_token = p_deletion_token");
    expect(assetsMigration).toContain(
      'drop policy if exists "authors can delete unfinished letters" on public.letters',
    );
    expect(assetsMigration).toContain(
      "revoke delete on public.letters from public, anon, authenticated",
    );
  });

  it("refuses to delete the parent while an attached Storage object still exists", () => {
    const finalizeFunction = assetsMigration.match(
      /create function public\.finalize_private_letter_deletion\([\s\S]*?revoke all on function public\.finalize_private_letter_deletion/,
    )?.[0];
    expect(finalizeFunction).toContain("from public.letter_assets as asset");
    expect(finalizeFunction).toContain("join storage.objects as stored_object");
    expect(finalizeFunction).toContain("asset.letter_id = letter_row.id");
    expect(finalizeFunction).toContain("asset.owner_id = caller_id");
    expect(finalizeFunction).toContain("stored_object.bucket_id = 'letter-images'");
    expect(finalizeFunction).toContain("stored_object.name = asset.storage_path");
  });

  it("retains immutable failed asset tombstones after the parent letter is deleted", () => {
    const assetTable = assetsMigration.match(
      /create table public\.letter_assets \(([\s\S]*?)\n\);/,
    )?.[1];
    expect(assetsMigration).toContain(
      "letter_id uuid references public.letters(id) on delete set null",
    );
    expect(assetsMigration).toContain("letter_key uuid not null");
    expect(assetsMigration).toContain(
      "(storage.foldername(storage_path))[2] = letter_key::text",
    );
    expect(assetsMigration).toContain("new.letter_key := new.letter_id");
    expect(assetTable).not.toContain(
      "letter_id uuid not null references public.letters(id) on delete cascade",
    );
    expect(assetsMigration).not.toContain(
      "grant delete on public.letter_assets to authenticated",
    );
    expect(assetsMigration).toMatch(
      /asset\.owner_id = \(select auth\.uid\(\)\)[\s\S]{0,180}asset\.upload_status = 'failed'/,
    );
    expect(assetsMigration).toMatch(
      /letter_assets\.owner_id = \(select auth\.uid\(\)\)\s+and letter_assets\.upload_status = 'failed'/,
    );
  });
});
