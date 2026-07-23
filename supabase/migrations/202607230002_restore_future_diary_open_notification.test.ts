import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607230002_restore_future_diary_open_notification.sql",
  ),
  "utf8",
).toLowerCase();

describe("final open_future_diary migration", () => {
  it("qualifies journal columns and preserves the idempotent, content-safe notification", () => {
    expect(sql).toContain("where journal.id = p_entry_id");
    expect(sql).toContain("journal.entry_type = 'future'");
    expect(sql).toContain(
      "opened_at = coalesce(public.journal_entries.opened_at, v_now)",
    );
    expect(sql).toContain("future_diary_opened");
    expect(sql).toContain(
      "on conflict (recipient_id, type, source_id)",
    );
    expect(sql).toContain("do nothing");
    expect(sql).not.toContain("journal.title");
    expect(sql).not.toContain("journal.content");
  });
});
