import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202607190001_rebuild_core.sql"),
  "utf8",
);

describe("rebuild core migration privileges", () => {
  it("revokes all table privileges before granting intended reads", () => {
    expect(migration).toContain(
      "revoke all privileges on table public.spaces, public.space_members, public.journal_entries from anon, authenticated;",
    );
    expect(migration).toContain(
      "grant select on public.spaces, public.space_members, public.journal_entries to authenticated;",
    );
  });

  it("revokes direct execution of trigger functions from API roles", () => {
    expect(migration).toContain(
      "revoke execute on function public.enforce_two_active_space_members() from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke execute on function public.preserve_journal_entry_immutability() from public, anon, authenticated;",
    );
  });

  it("exposes only the membership helper to authenticated users", () => {
    expect(migration).toContain(
      "revoke execute on function public.is_active_space_member(uuid, uuid) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.is_active_space_member(uuid, uuid) to authenticated;",
    );
  });
});
