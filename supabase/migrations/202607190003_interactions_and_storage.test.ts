import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607190003_interactions_and_storage.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("private journal image storage migration", () => {
  it("creates an explicitly private WebP-only bucket capped at 800 KB", () => {
    const migration = readMigration();

    expect(migration).toContain("'journal-images', 'journal-images', false, 819200");
    expect(migration).toContain("array['image/webp']");
    expect(migration).toMatch(/on conflict \(id\) do update[\s\S]*public = excluded\.public/);
    expect(migration).not.toMatch(/'journal-images'[^;]*getpublicurl/);
  });

  it("allows uploads only to the authenticated active member's three-part path", () => {
    const migration = readMigration();

    expect(migration).toContain('create policy "authors can upload journal images"');
    expect(migration).toContain("bucket_id = 'journal-images'");
    expect(migration).toContain("owner_id = (select auth.uid())::text");
    expect(migration).toContain("member.space_id::text = (storage.foldername(name))[1]");
    expect(migration).toContain("member.user_id = (select auth.uid())");
    expect(migration).toContain("member.active");
    expect(migration).toContain("(storage.foldername(name))[2] = (select auth.uid())::text");
    expect(migration).toContain("array_length(storage.foldername(name), 1) = 2");
    expect(migration).toMatch(/storage\.filename\(name\)[^\n]*\\\.webp/);
  });

  it("does not permit a storage read unless the matching journal row is fully visible", () => {
    const migration = readMigration();

    expect(migration).toContain('create policy "authorized readers can read journal images"');
    expect(migration).toContain("journal.image_path = storage.objects.name");
    expect(migration).toContain("journal.image_path = journal.space_id::text || '/' || journal.author_id::text || '/' || journal.id::text || '.webp'");
    expect(migration).toContain("journal.author_id = (select auth.uid())");
    expect(migration).toMatch(/journal\.recipient_id = \(select auth\.uid\(\)\)\s+and journal\.opened_at is not null/);
    expect(migration).not.toContain("now() >= journal.open_at");
  });

  it("allows deletes only for active owners with canonical orphan or editable-today targets", () => {
    const migration = readMigration();
    const start = migration.indexOf('create policy "authors can remove journal images"');
    const end = migration.indexOf(";", start);
    const policy = migration.slice(start, end);

    expect(policy).toContain("member.active");
    expect(policy).toContain("member.user_id = (select auth.uid())");
    expect(policy).toContain("member.space_id::text = (storage.foldername(name))[1]");
    expect(policy).toContain("(storage.foldername(name))[2] = (select auth.uid())::text");
    expect(policy).toContain("journal.image_path = storage.objects.name");
    expect(policy).toContain("not exists");
    expect(policy).toContain("journal.entry_type = 'today'");
    expect(policy).toContain("journal.author_id = (select auth.uid())");
    expect(policy).toContain("clock_timestamp() <= journal.locked_at");
  });

  it("records failed cleanup as private canonical identifiers for service-role reconciliation", () => {
    const migration = readMigration();

    expect(migration).toContain("create table public.journal_image_cleanup_jobs");
    expect(migration).not.toMatch(/journal_image_cleanup_jobs[\s\S]{0,600}object_path/);
    expect(migration).toContain("revoke all on table public.journal_image_cleanup_jobs from public, anon, authenticated");
    expect(migration).toContain("grant select, update, delete on table public.journal_image_cleanup_jobs to service_role");
    expect(migration).toContain("create or replace function public.enqueue_journal_image_cleanup");
    expect(migration).toContain("public.is_active_space_member(p_space_id, v_user_id)");
    expect(migration).toContain("p_reason not in ('database_write_failed', 'diary_deleted')");
    expect(migration).toContain("grant execute on function public.enqueue_journal_image_cleanup(uuid, uuid, text) to authenticated");
  });

  it("prevents cleanup queueing for a retained locked or future canonical image", () => {
    const migration = readMigration();
    const start = migration.indexOf("create or replace function public.enqueue_journal_image_cleanup");
    const end = migration.indexOf("\n$$;", start);
    const definition = migration.slice(start, end);

    expect(definition).toContain("journal.image_path = v_image_path");
    expect(definition).toContain("journal.entry_type <> 'today'");
    expect(definition).toContain("clock_timestamp() > journal.locked_at");
    expect(definition).toContain("raise exception 'journal image is retained'");
  });

  it.each(["create_today_diary", "seal_future_diary"])(
    "%s accepts a preallocated entry ID and inserts that exact ID",
    (name) => {
      const migration = readMigration();
      const start = migration.indexOf(`create or replace function public.${name}`);
      const end = migration.indexOf("\n$$;", start);
      const definition = migration.slice(start, end);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(definition).toContain("p_entry_id uuid default gen_random_uuid()");
      expect(definition).toMatch(/insert into public\.journal_entries \(\s*id,/s);
      expect(definition).toMatch(/values \(\s*p_entry_id,/s);
      expect(definition).toContain("p_image_path <> p_space_id::text || '/' || v_user_id::text || '/' || p_entry_id::text || '.webp'");
    },
  );

  it("rejects an update image path that does not match the locked entry's space and author", () => {
    const migration = readMigration();
    const start = migration.indexOf("create or replace function public.update_today_diary");
    const end = migration.indexOf("\n$$;", start);
    const definition = migration.slice(start, end);

    expect(definition).toContain("p_image_path <> v_space_id::text || '/' || v_author_id::text || '/' || p_entry_id::text || '.webp'");
    expect(definition.indexOf("for update")).toBeLessThan(definition.indexOf("p_image_path <>"));
  });

  it("leaves interaction tables for the later additive migration", () => {
    const migration = readMigration();

    expect(migration).not.toMatch(/create table (public\.)?(reactions|comments|interactions)/);
  });
});
