import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/202607250002_independent_memories.sql"),
  "utf8",
);

describe("independent memories migration", () => {
  it("adds memory data and calendar classification without replacing existing tables", () => {
    expect(sql).toMatch(/create table if not exists public\.memory_entries/i);
    expect(sql).toMatch(/alter table public\.calendar_events\s+add column if not exists event_type/i);
    expect(sql).toMatch(/add column if not exists is_important boolean not null default false/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b|\btruncate\b/i);
  });

  it("enforces active-space reads and author-only 24-hour mutations", () => {
    expect(sql).toMatch(/public\.is_active_space_member\(space_id\)/i);
    expect(sql.match(/author_id\s*=\s*v_actor/gi)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/created_at\s*>\s*now\(\)\s*-\s*interval '24 hours'/gi)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/revoke all privileges on table public\.memory_entries from anon, authenticated/i);
    expect(sql).toMatch(/grant select on table public\.memory_entries to authenticated/i);
  });

  it("keeps memory image mutation private and tied to the memory row", () => {
    expect(sql).toMatch(/values \('memory-images', 'memory-images', false/i);
    expect(sql).toMatch(/bucket_id = 'memory-images'/i);
    expect(sql).toMatch(/authors can update memory images/i);
    expect(sql).toMatch(/authors can remove memory images/i);
  });
});
