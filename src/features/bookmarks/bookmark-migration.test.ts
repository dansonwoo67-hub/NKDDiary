import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202607130002_letter_assets_bookmarks.sql"), "utf8");

describe("bookmark migration safety", () => {
  it("keeps bookmarks private, owner-scoped, and published-letter-only", () => {
    expect(sql).toContain("alter table public.bookmarks enable row level security");
    expect(sql).toMatch(/users can read own bookmarks[\s\S]*owner_id = \(select auth\.uid\(\)\)/);
    expect(sql).toMatch(/users can bookmark readable published letters[\s\S]*parent_letter\.status = 'published'/);
    expect(sql).toMatch(/users can delete own bookmarks[\s\S]*owner_id = \(select auth\.uid\(\)\)/);
  });

  it("enforces exact bounded excerpt shapes and race-safe uniqueness", () => {
    expect(sql).toMatch(/bookmarks_anchor_shape_check[\s\S]*block_id ~ '\^\[A-Za-z0-9\]/);
    expect(sql).toContain("end_offset > start_offset");
    expect(sql).toContain("char_length(quoted_text) between 1 and 1000");
    // Browser anchors use UTF-16 offsets while Postgres char_length counts code points;
    // exact equality would reject emoji, so SQL bounds both and the server verifies the slice.
    expect(sql).toContain("end_offset - start_offset <= 1000");
    expect(sql).toContain("create unique index bookmarks_owner_letter_anchor_uidx");
  });

  it("does not allow bookmark ownership updates", () => {
    expect(sql).toContain("revoke all on public.letter_assets, public.bookmarks from public, anon, authenticated");
    expect(sql).not.toMatch(/grant\s+update[\s\S]{0,80}public\.bookmarks/i);
  });
});
