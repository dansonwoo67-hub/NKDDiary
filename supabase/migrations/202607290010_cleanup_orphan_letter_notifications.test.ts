import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607290010_cleanup_orphan_letter_notifications.sql",
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase()
  : "";

describe("202607290010 cleanup orphan letter notifications", () => {
  it("contains a single update statement that deactivates orphan letter notifications", () => {
    expect(sql).toMatch(
      /update public\.notifications[\s\S]*set is_active = false,\s*is_read = true/,
    );
  });

  it("only targets letter-type notifications", () => {
    expect(sql).toContain("'journal_created'");
    expect(sql).toContain("'future_diary_opened'");
    expect(sql).toMatch(/type in \(/);
  });

  it("only touches active unread notifications", () => {
    expect(sql).toContain("is_active = true");
  });

  it("checks source_id existence against journal_entries", () => {
    expect(sql).toMatch(
      /not exists \([\s\S]*from public\.journal_entries as entry[\s\S]*entry\.id = notifications\.source_id/,
    );
  });

  it("does not delete any data", () => {
    expect(sql).not.toMatch(/delete\s+from/i);
  });

  it("does not modify table structure", () => {
    expect(sql).not.toMatch(/alter\s+table/i);
    expect(sql).not.toMatch(/create\s+table/i);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/add\s+column/i);
    expect(sql).not.toMatch(/drop\s+column/i);
  });

  it("does not modify RLS policies", () => {
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).not.toMatch(/drop\s+policy/i);
    expect(sql).not.toMatch(/alter\s+policy/i);
  });

  it("does not create or modify RPC functions", () => {
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sql).not.toMatch(/drop\s+function/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?trigger/i);
    expect(sql).not.toMatch(/drop\s+trigger/i);
  });
});
