import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607280009_finalize_letter_notification_state.sql",
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8").toLowerCase()
  : "";

function functionBody(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("final letter and notification state migration", () => {
  it("retires every authenticated letter deletion API and its empty state table", () => {
    expect(sql).toContain(
      "drop function if exists public.delete_letter_diary(uuid)",
    );
    expect(sql).toContain(
      "drop function if exists public.purge_letter_diary(uuid)",
    );
    expect(sql).toContain(
      "drop function if exists public.empty_letter_recycle_bin()",
    );
    expect(sql).toContain(
      "drop function if exists public.auto_purge_letter_deletions()",
    );
    expect(sql).toContain("drop table if exists public.letter_deletions");
    expect(sql).not.toMatch(
      /drop\s+column\s+(?:if\s+exists\s+)?(?:deleted_at|purge_at)/,
    );
  });

  it("withdraws without writing deletion lifecycle fields and invalidates notifications", () => {
    const body = functionBody("withdraw_letter_diary");

    expect(body).toContain("set withdrawn_at = clock_timestamp()");
    expect(body).not.toMatch(/set[\s\S]*deleted_at\s*=/);
    expect(body).not.toMatch(/set[\s\S]*purge_at\s*=/);
    expect(body).toContain("and author_id = auth.uid()");
    expect(body).toContain("and clock_timestamp() <= locked_at");
    expect(body).toMatch(
      /update public\.notifications[\s\S]*set is_active = false,\s*is_read = true/,
    );
  });

  it("marks normal letters and their active notifications read idempotently", () => {
    const body = functionBody("mark_letter_read");

    expect(body).toContain("and recipient_id = auth.uid()");
    expect(body).toContain("and withdrawn_at is null");
    expect(body).toContain(
      "opened_at = coalesce(opened_at, clock_timestamp())",
    );
    expect(body).toContain(
      "opened_by = coalesce(opened_by, auth.uid())",
    );
    expect(body).toMatch(
      /update public\.notifications[\s\S]*set is_read = true[\s\S]*and is_active = true/,
    );
  });

  it("exposes only withdrawal status instead of the withdrawn body to recipients", () => {
    const statusBody = functionBody("get_letter_withdrawal_status");

    expect(sql).toMatch(
      /create policy "active members can read visible journal entries"[\s\S]*recipient_id = auth\.uid\(\)[\s\S]*withdrawn_at is null/,
    );
    expect(statusBody).toContain("returns table(id uuid, withdrawn_at timestamptz)");
    expect(statusBody).toContain("entry.recipient_id = auth.uid()");
    expect(statusBody).toContain("entry.withdrawn_at is not null");
    expect(statusBody).not.toMatch(/\bcontent\b|\bplain_text\b|\brich_content\b/);
    expect(sql).toContain(
      "grant execute on function public.get_letter_withdrawal_status(uuid) to authenticated",
    );
  });

  it("deactivates withdrawn and orphaned letter notifications without deleting records", () => {
    expect(sql).toMatch(
      /update public\.notifications as notification[\s\S]*set is_active = false,\s*is_read = true[\s\S]*entry\.withdrawn_at is not null/,
    );
    expect(sql).toMatch(
      /update public\.notifications as notification[\s\S]*not exists \([\s\S]*from public\.journal_entries as entry[\s\S]*entry\.id = notification\.source_id/,
    );
    expect(sql).not.toMatch(/delete\s+from\s+public\.notifications/);
    expect(sql).not.toMatch(/delete\s+from\s+public\.journal_entries/);
  });
});
