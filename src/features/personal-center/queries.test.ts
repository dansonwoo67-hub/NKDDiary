import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCursor,
  clampPersonalLimit,
  decodeCursor,
  pageSortedRows,
  type PersonalSortableRow,
} from "./queries";

describe("personal center queries", () => {
  it("orders personal content by timestamp then id and returns a stable cursor", () => {
    const rows: PersonalSortableRow[] = [
      { id: "a", timestamp: "2026-07-12T08:00:00Z" },
      { id: "c", timestamp: "2026-07-13T08:00:00Z" },
      { id: "b", timestamp: "2026-07-13T08:00:00Z" },
    ];

    const page = pageSortedRows(rows, { limit: 2, cursor: null });

    expect(page.items.map((item) => item.id)).toEqual(["c", "b"]);
    expect(page.nextCursor).toBe(buildCursor("2026-07-13T08:00:00Z", "b"));
  });

  it("continues after a timestamp/id cursor without duplicating the boundary row", () => {
    const rows: PersonalSortableRow[] = [
      { id: "d", timestamp: "2026-07-14T08:00:00Z" },
      { id: "c", timestamp: "2026-07-13T08:00:00Z" },
      { id: "b", timestamp: "2026-07-13T08:00:00Z" },
      { id: "a", timestamp: "2026-07-12T08:00:00Z" },
    ];

    const page = pageSortedRows(rows, { limit: 2, cursor: buildCursor("2026-07-13T08:00:00Z", "b") });

    expect(page.items.map((item) => item.id)).toEqual(["a"]);
    expect(page.nextCursor).toBeNull();
  });

  it("clamps page limits to a maximum of 20", () => {
    expect(clampPersonalLimit(undefined)).toBe(20);
    expect(clampPersonalLimit(0)).toBe(1);
    expect(clampPersonalLimit(99)).toBe(20);
  });

  it("round-trips cursor payloads and rejects invalid cursors", () => {
    const cursor = buildCursor("2026-07-13T08:00:00Z", "letter-1");

    expect(decodeCursor(cursor)).toEqual({ timestamp: "2026-07-13T08:00:00Z", id: "letter-1" });
    expect(decodeCursor("not-json")).toBeNull();
  });

  it("keeps production queries viewer-scoped and bounded", () => {
    const source = readFileSync(resolve(process.cwd(), "src/features/personal-center/queries.ts"), "utf8");

    expect(source).toMatch(/\.eq\("author_id", userId\)/);
    expect(source).toMatch(/\.eq\("owner_id", userId\)/);
    expect(source).toMatch(/\.eq\("creator_id", userId\)/);
    expect(source).toMatch(/\.limit\(limit \+ 1\)/);
  });
});
