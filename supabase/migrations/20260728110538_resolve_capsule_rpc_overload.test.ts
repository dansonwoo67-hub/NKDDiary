import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260728110538_resolve_capsule_rpc_overload.sql"),
  "utf8",
).toLowerCase();
const normalizedMigration = migration
  .replace(/\s+/g, " ")
  .replace(/\(\s+/g, "(")
  .replace(/\s+\)/g, ")");

describe("capsule RPC overload migration", () => {
  it("keeps the six-argument RPC unambiguous by renaming only the image orchestration overload", () => {
    expect(migration).toMatch(
      /alter function public\.seal_future_diary\s*\(\s*uuid,\s*text,\s*text,\s*uuid,\s*timestamptz,\s*text,\s*uuid\s*\)/,
    );
    expect(migration).toContain("rename to seal_future_diary_with_image");
    expect(normalizedMigration).toContain(
      "revoke execute on function public.seal_future_diary(uuid, text, text, uuid, timestamptz, text) from public, anon",
    );
    expect(normalizedMigration).toContain(
      "grant execute on function public.seal_future_diary(uuid, text, text, uuid, timestamptz, text) to authenticated, service_role",
    );
    expect(migration).not.toMatch(/drop\s+(table|column)/);
  });
});
