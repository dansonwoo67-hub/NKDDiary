import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607190002_journal_functions.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("journal lifecycle migration contract", () => {
  it("exposes only narrow lifecycle and safe-card functions to authenticated users", () => {
    const migration = readMigration();

    expect(migration).toContain("create or replace function public.list_future_diary_cards");
    expect(migration).toMatch(/returns table\s*\(\s*id uuid,\s*author_id uuid,\s*recipient_id uuid,\s*sealed_at timestamptz,\s*open_at timestamptz,\s*opened_at timestamptz,\s*created_at timestamptz\s*\)/s);
    expect(migration).not.toMatch(/returns table\s*\([^)]*(title|content|image_path)/s);
    expect(migration).toContain("grant execute on function public.list_future_diary_cards(text) to authenticated;");
    expect(migration).toContain("revoke insert, update, delete on table public.journal_entries from anon, authenticated;");
  });

  it("derives Shanghai dates and validates the other active member before sealing", () => {
    const migration = readMigration();

    expect(migration).toContain("now() at time zone 'asia/shanghai'");
    expect(migration).toMatch(/from public\.space_members[\s\S]*user_id = p_recipient_id[\s\S]*active/);
    expect(migration).toContain("p_open_at <= v_now");
  });

  it("locks opening and records it idempotently using database time", () => {
    const migration = readMigration();

    expect(migration).toMatch(/from public\.journal_entries[\s\S]*where id = p_entry_id[\s\S]*for update/);
    expect(migration).toContain("v_recipient_id <> auth.uid()");
    expect(migration).toContain("v_now < v_open_at");
    expect(migration).toContain("opened_at = coalesce(opened_at, now())");
    expect(migration).toContain("opened_by = coalesce(opened_by, auth.uid())");
  });

  it("preserves full-content RLS until an explicit recipient open", () => {
    const migration = readMigration();

    expect(migration).toContain("recipient_id = (select auth.uid()) and opened_at is not null");
    expect(migration).not.toContain("recipient_id = (select auth.uid()) and now() >= open_at");
  });
});
