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

function readFunction(name: string) {
  const migration = readMigration();
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);

  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} must have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("journal lifecycle migration contract", () => {
  it("exposes only narrow lifecycle and safe-card functions to authenticated users", () => {
    const migration = readMigration();

    expect(migration).toContain("create or replace function public.list_future_diary_cards");
    expect(migration).toMatch(/returns table\s*\(\s*id uuid,\s*author_id uuid,\s*recipient_id uuid,\s*sealed_at timestamptz,\s*open_at timestamptz,\s*opened_at timestamptz,\s*created_at timestamptz\s*\)/);
    expect(migration).not.toMatch(/returns table\s*\([^)]*(title|content|image_path)/);
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

    expect(migration).toMatch(/from public\.journal_entries as journal[\s\S]*where journal\.id = p_entry_id[\s\S]*journal\.entry_type = 'future'[\s\S]*for update/);
    expect(migration).toContain("v_recipient_id <> auth.uid()");
    expect(migration).toContain("v_now < v_open_at");
    expect(migration).toContain(
      "opened_at = coalesce(public.journal_entries.opened_at, now())",
    );
    expect(migration).toContain(
      "opened_by = coalesce(public.journal_entries.opened_by, auth.uid())",
    );
  });

  it.each(["open_future_diary", "update_today_diary", "delete_today_diary"])(
    "%s rejects callers who are no longer active members after locking the row",
    (name) => {
      const definition = readFunction(name);
      const lockAt = definition.indexOf("for update");
      const membershipAt = definition.indexOf(
        "public.is_active_space_member(v_space_id, auth.uid())",
      );

      expect(definition).toContain("journal.space_id");
      expect(lockAt).toBeGreaterThanOrEqual(0);
      expect(membershipAt).toBeGreaterThan(lockAt);
    },
  );

  it.each(["update_today_diary", "delete_today_diary"])(
    "%s checks the wall-clock deadline only after acquiring the row lock",
    (name) => {
      const definition = readFunction(name);
      const lockAt = definition.indexOf("for update");
      const wallClockAt = definition.indexOf("clock_timestamp()");

      expect(lockAt).toBeGreaterThanOrEqual(0);
      expect(wallClockAt).toBeGreaterThan(lockAt);
      expect(definition).not.toContain("v_now timestamptz := now()");
    },
  );

  it("preserves full-content RLS until an explicit recipient open", () => {
    const migration = readMigration();

    expect(migration).toContain("recipient_id = (select auth.uid()) and opened_at is not null");
    expect(migration).not.toContain("recipient_id = (select auth.uid()) and now() >= open_at");
  });
});
