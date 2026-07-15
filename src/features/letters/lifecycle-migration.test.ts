import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202607130001_letter_lifecycle.sql"),
  "utf8",
);

describe("letter lifecycle migration", () => {
  it("requires a non-whitespace body of at most 50,000 characters in every completed branch", () => {
    const whitespaceAwareChecks = migration.match(
      /if new\.body_text is null or new\.body_text !~ '\[\^\[:space:\]\]' or char_length\(new\.body_text\) > 50000 then/g,
    );

    expect(whitespaceAwareChecks).toHaveLength(3);
    expect(migration).not.toMatch(/char_length\s*\(\s*btrim\s*\(\s*new\.body_text/i);
  });

  it("enforces the same 1-7 character limit for salutations and final lines", () => {
    expect(migration.match(/char_length\(new\.salutation\) not between 1 and 7/g)).toHaveLength(3);
    expect(migration.match(/char_length\(new\.seven_char_line\) not between 1 and 7/g)).toHaveLength(3);
    expect(migration).not.toContain("salutation must contain 1 to 20 characters");
    expect(migration).toContain(
      "new.salutation = regexp_replace(new.salutation, '^[[:space:]]+|[[:space:]]+$', '', 'g')",
    );
    expect(migration).toContain(
      "new.seven_char_line = regexp_replace(new.seven_char_line, '^[[:space:]]+|[[:space:]]+$', '', 'g')",
    );
  });

  it("applies seven-character checks to inserts and every status", () => {
    expect(migration).toContain(
      "constraint letters_salutation_max_seven_characters\n    check (salutation is null or char_length(btrim(salutation)) <= 7)",
    );
    expect(migration).toContain(
      "constraint letters_final_line_max_seven_characters\n    check (seven_char_line is null or char_length(btrim(seven_char_line)) <= 7)",
    );
  });

  it("requires scheduled time capsules to land on a future Shanghai calendar day", () => {
    const shanghaiDayChecks = migration.match(
      /\(new\.scheduled_for at time zone 'Asia\/Shanghai'\)::date\s*<= \(now\(\) at time zone 'Asia\/Shanghai'\)::date/g,
    );

    expect(shanghaiDayChecks).toHaveLength(2);
  });

  it("does not grant direct letter deletion that could orphan private storage", () => {
    expect(migration).not.toContain("grant delete on public.letters to authenticated");
    expect(migration).not.toContain("on public.letters for delete to authenticated");
    expect(migration).toContain("revoke insert, update, delete on public.letters from authenticated");
  });
});
