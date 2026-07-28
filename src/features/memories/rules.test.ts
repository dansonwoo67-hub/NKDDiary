import { describe, expect, it } from "vitest";
import { calendarBelongsInMemories } from "./rules";

describe("calendar memory inclusion", () => {
  it.each(["date", "anniversary", "birthday", "travel"] as const)(
    "includes %s automatically",
    (type) => {
      expect(calendarBelongsInMemories(type, false)).toBe(true);
    },
  );

  it.each(["todo", "other"] as const)("includes %s only when marked important", (type) => {
    expect(calendarBelongsInMemories(type, false)).toBe(false);
    expect(calendarBelongsInMemories(type, true)).toBe(true);
  });
});
