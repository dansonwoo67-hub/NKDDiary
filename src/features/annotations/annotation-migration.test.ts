import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  "202607100001_initial_schema.sql",
  "202607130001_letter_lifecycle.sql",
  "202607130002_letter_assets_bookmarks.sql",
];
const migrations = migrationPaths.map((name) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8"),
);
const latest = migrations.at(-1)!;

function columns(value: string) {
  return value.split(",").map((column) => column.trim()).filter(Boolean);
}

function effectiveAnnotationPrivileges(sqlFiles: string[]) {
  let tableInsert = false;
  let tableUpdate = false;
  const insertColumns = new Set<string>();
  const updateColumns = new Set<string>();

  for (const sql of sqlFiles) {
    for (const match of sql.matchAll(/(grant|revoke)\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+(?:to|from)\s+authenticated\s*;/gi)) {
      const relations = match[3].split(",").map((relation) => relation.trim().toLowerCase());
      if (!relations.includes("public.annotations")) continue;
      const operation = match[1].toLowerCase();
      const privileges = match[2].trim();
      for (const privilege of privileges.split(/,(?![^()]*\))/)) {
        const parsed = privilege.trim().match(/^(insert|update)(?:\s*\(([^)]*)\))?$/i);
        if (!parsed) continue;
        const kind = parsed[1].toLowerCase();
        const target = kind === "insert" ? insertColumns : updateColumns;
        if (!parsed[2]) {
          if (kind === "insert") tableInsert = operation === "grant";
          else tableUpdate = operation === "grant";
        } else {
          for (const column of columns(parsed[2])) {
            if (operation === "grant") target.add(column);
            else target.delete(column);
          }
        }
      }
    }
  }
  return { tableInsert, tableUpdate, insertColumns, updateColumns };
}

function effectiveAnnotationPolicies(sqlFiles: string[]) {
  const policies = new Map<string, { command: string; definition: string }>();
  for (const sql of sqlFiles) {
    for (const drop of sql.matchAll(/drop policy if exists "([^"]+)" on public\.annotations\s*;/gi)) {
      policies.delete(drop[1]);
    }
    for (const create of sql.matchAll(/create policy "([^"]+)"\s+on public\.annotations for (insert|update)[\s\S]*?\n\);/gi)) {
      policies.set(create[1], { command: create[2].toLowerCase(), definition: create[0] });
    }
  }
  return policies;
}

describe("annotation anchor migration", () => {
  it("keeps legacy null anchors readable while constraining anchored rows", () => {
    expect(latest).toMatch(/annotations_anchor_shape_check[\s\S]+block_id is null[\s\S]+block_id ~ '\^\[A-Za-z0-9\]/);
    expect(latest).toContain("end_offset > start_offset");
  });

  it("leaves Data API inserts column-scoped and removes every update path", () => {
    const beforeHardening = effectiveAnnotationPrivileges(migrations.slice(0, 2));
    expect(beforeHardening.tableInsert).toBe(true);
    expect(beforeHardening.updateColumns.has("quoted_text")).toBe(true);

    const privileges = effectiveAnnotationPrivileges(migrations);
    expect(privileges.tableInsert).toBe(false);
    expect([...privileges.insertColumns].sort()).toEqual([
      "author_id", "block_id", "comment", "end_offset", "letter_id", "quoted_text", "start_offset",
    ]);
    expect(privileges.tableUpdate).toBe(false);
    expect([...privileges.updateColumns]).toEqual([]);
  });

  it("requires a complete non-null anchor in the effective INSERT policy and has no UPDATE policy", () => {
    const policies = effectiveAnnotationPolicies(migrations);
    const insert = policies.get("members can annotate published letters");
    expect(insert?.command).toBe("insert");
    expect(insert?.definition).toMatch(/block_id is not null/);
    expect(insert?.definition).toMatch(/block_id ~ '\^\[A-Za-z0-9\]/);
    expect(insert?.definition).toMatch(/start_offset >= 0[\s\S]+end_offset > start_offset/);
    expect(insert?.definition).toMatch(/quoted_text ~ '\[\^\[:space:\]\]'/);
    expect(insert?.definition).toMatch(/parent_letter\.status = 'published'/);
    expect(policies.has("members can update own published letter annotations")).toBe(false);
  });
});
