import { describe, expect, it } from "vitest";
import { getJournalAccountStateKey } from "./account-state-key";

describe("getJournalAccountStateKey", () => {
  it("isolates Susan → Niki → Susan and changes after an unread refresh", () => {
    const susanBefore = getJournalAccountStateKey("susan", ["letter-2", "letter-1"]);
    const niki = getJournalAccountStateKey("niki", ["letter-1"]);
    const susanAfterRefresh = getJournalAccountStateKey("susan", ["letter-2"]);

    expect(susanBefore).not.toBe(niki);
    expect(niki).not.toBe(susanAfterRefresh);
    expect(susanBefore).not.toBe(susanAfterRefresh);
    expect(getJournalAccountStateKey("susan", ["letter-1", "letter-2"])).toBe(susanBefore);
  });
});
