import { describe, expect, it } from "vitest";
import { APP_NAVIGATION } from "./navigation";

describe("app navigation", () => {
  it("routes every primary product area to the rebuilt feature", () => {
    expect(APP_NAVIGATION).toEqual([
      { href: "/", label: "首页" },
      { href: "/journal", label: "日记" },
      { href: "/memories", label: "回忆" },
      { href: "/calendar", label: "日历" },
      { href: "/mood", label: "心情" },
      { href: "/settings", label: "设置" },
    ]);
    expect(APP_NAVIGATION.some(({ href }) => href.startsWith("/write") || href.startsWith("/letters"))).toBe(false);
  });
});
