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

  it("allows only canonical or server-derived scoped backup paths for active owners", () => {
    const migration = readMigration();

    expect(migration).toContain('create policy "authors can upload journal images"');
    expect(migration).toContain("bucket_id = 'journal-images'");
    expect(migration).toContain("owner_id = (select auth.uid())::text");
    expect(migration).toContain("member.space_id::text = (storage.foldername(name))[1]");
    expect(migration).toContain("member.user_id = (select auth.uid())");
    expect(migration).toContain("member.active");
    expect(migration).toContain("(storage.foldername(name))[2] = (select auth.uid())::text");
    expect(migration).toContain("array_length(storage.foldername(name), 1) = 2");
    expect(migration).toContain("array_length(storage.foldername(name), 1) = 4");
    expect(migration).toContain("(storage.foldername(name))[3] = '.backups'");
    expect(migration).toContain("journal.id::text = (storage.foldername(name))[4]");
    expect(migration).toContain("journal.image_path = journal.space_id::text || '/' || journal.author_id::text || '/' || journal.id::text || '.webp'");
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
    expect(migration).toContain("(storage.foldername(name))[3] = '.backups'");
    expect(migration).toContain("journal.author_id = (select auth.uid())");
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
    expect(migration).toContain("backup_id uuid");
    expect(migration).not.toMatch(/journal_image_cleanup_jobs[\s\S]{0,600}object_path/);
    expect(migration).toContain("revoke all on table public.journal_image_cleanup_jobs from public, anon, authenticated");
    expect(migration).toContain("grant select, update, delete on table public.journal_image_cleanup_jobs to service_role");
    expect(migration).toContain("create or replace function public.enqueue_journal_image_cleanup");
    expect(migration).toContain("public.is_active_space_member(p_space_id, v_user_id)");
    expect(migration).toContain("'backup_cleanup_failed'");
    expect(migration).toContain("'replacement_restore_failed'");
    expect(migration).toContain("grant execute on function public.enqueue_journal_image_cleanup(uuid, uuid, text, uuid) to authenticated");
  });

  it("prevents cleanup queueing for a retained locked or future canonical image", () => {
    const migration = readMigration();
    const start = migration.indexOf("create or replace function public.enqueue_journal_image_cleanup");
    const end = migration.indexOf("\n$$;", start);
    const definition = migration.slice(start, end);

    expect(definition).toContain("journal.image_path = v_canonical_path");
    expect(definition).toContain("journal.entry_type <> 'today'");
    expect(definition).toContain("clock_timestamp() > journal.locked_at");
    expect(definition).toContain("raise exception 'journal image is retained'");
  });

  it("rejects fabricated cleanup targets and derives every object path inside SQL", () => {
    const migration = readMigration();
    const start = migration.indexOf("create or replace function public.enqueue_journal_image_cleanup");
    const end = migration.indexOf("\n$$;", start);
    const definition = migration.slice(start, end);

    expect(definition).toContain("p_backup_id uuid default null");
    expect(definition).toContain("from storage.objects as object");
    expect(definition).toContain("object.bucket_id = 'journal-images'");
    expect(definition).toContain("object.name = v_target_path");
    expect(definition).toContain("object.owner_id = v_user_id::text");
    expect(definition).toContain("raise exception 'cleanup target not found'");
    expect(definition).toContain("journal.id = p_entry_id");
    expect(definition).toContain("journal.space_id = p_space_id");
    expect(definition).toContain("journal.author_id = v_user_id");
    expect(definition).toContain("raise exception 'backup provenance not found'");
    expect(definition).not.toContain("p_object_path");
  });

  it("deduplicates cleanup work and caps pending jobs per author and space", () => {
    const migration = readMigration();
    const start = migration.indexOf("create or replace function public.enqueue_journal_image_cleanup");
    const end = migration.indexOf("\n$$;", start);
    const definition = migration.slice(start, end);

    expect(migration).toContain("coalesce(backup_id, '00000000-0000-0000-0000-000000000000'::uuid)");
    expect(definition).toContain("backup_id is not distinct from p_backup_id");
    expect(definition).toContain("count(*) >= 20");
    expect(definition).toContain("raise exception 'cleanup queue limit exceeded'");
    expect(definition.indexOf("backup_id is not distinct from p_backup_id")).toBeLessThan(
      definition.indexOf("count(*) >= 20"),
    );
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
