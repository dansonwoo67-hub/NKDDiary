import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const retiredObjects = [
  "delete_letter_diary",
  "purge_letter_diary",
  "empty_letter_recycle_bin",
  "auto_purge_letter_deletions",
  "letter_deletions",
];

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => /\.(?:ts|tsx|js|jsx)$/.test(path) && !path.endsWith(".test.ts"));
}

describe("retired letter deletion lifecycle", () => {
  it("has no runtime references in application or scripts", () => {
    const roots = ["src", "scripts"]
      .map((directory) => join(process.cwd(), directory))
      .filter((directory) => {
        try {
          return statSync(directory).isDirectory();
        } catch {
          return false;
        }
      });
    const runtimeSource = roots
      .flatMap(sourceFiles)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    for (const objectName of retiredObjects) {
      expect(runtimeSource.toLowerCase()).not.toContain(objectName);
    }
  });

  it("does not expose letter deletion or recycle-bin copy in active letter UI", () => {
    const uiFiles = [
      "src/features/journal/components/EnvelopeLetterCard.tsx",
      "src/features/journal/components/JournalPageClient.tsx",
      "src/features/journal/components/LetterReaderV1.tsx",
    ];
    const activeLetterUi = uiFiles
      .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
      .join("\n");

    expect(activeLetterUi).not.toMatch(/回收站|永久删除|删除信件|删除这封信/);
  });
});
