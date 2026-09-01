import { describe, expect, it } from "vitest";
import { selectE2eJournalFixtures } from "./e2e-fixture-scope";

describe("E2E fixture cleanup scope", () => {
  it("selects only marker-prefixed rows owned by the dedicated E2E users", () => {
    const selected = selectE2eJournalFixtures([
      { id: "own-e2e", author_id: "user-a", content: "e2e_run_a capsule", image_path: "e2e/run-a.webp" },
      { id: "own-real", author_id: "user-a", content: "private memory", image_path: null },
      { id: "other-e2e", author_id: "other-user", content: "e2e_run_a capsule", image_path: null },
      { id: "other-run", author_id: "user-b", content: "e2e_run_b capsule", image_path: null },
    ], ["user-a", "user-b"], "e2e_run_a");

    expect(selected).toEqual([
      { id: "own-e2e", author_id: "user-a", content: "e2e_run_a capsule", image_path: "e2e/run-a.webp" },
    ]);
  });

  it("rejects a cleanup prefix outside the e2e_ namespace", () => {
    expect(() => selectE2eJournalFixtures([], ["user-a", "user-b"], "private")).toThrow(
      "E2E cleanup marker must start with e2e_",
    );
  });
});
