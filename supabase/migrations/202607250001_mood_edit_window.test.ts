import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "supabase/migrations/202607250001_mood_edit_window.sql");

describe("mood edit window migration", () => {
  it("allows only the author inside the 24-hour window to update or delete", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/create or replace function public\.update_mood_entry\(p_id uuid, p_body text\)/i);
    expect(sql).toMatch(/create or replace function public\.delete_mood_entry\(p_id uuid\)/i);
    expect(sql.match(/author_id\s*=\s*v_actor/gi)).toHaveLength(2);
    expect(sql.match(/created_at\s*>\s*now\(\)\s*-\s*interval '24 hours'/gi)).toHaveLength(2);
    expect(sql).toMatch(/public\.is_active_space_member\(mood\.space_id,\s*v_actor\)/i);
  });

  it("exposes only the guarded RPCs and contains no destructive schema operation", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/grant execute on function public\.update_mood_entry\(uuid, text\) to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.delete_mood_entry\(uuid\) to authenticated/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b|\btruncate\b/i);
  });
});
