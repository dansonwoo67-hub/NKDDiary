import { describe, expect, it } from "vitest";
import { APP_NAVIGATION } from "./navigation";

describe("app navigation", () => {
  it("keeps only the five CoupleOS primary destinations in display order", () => {
    expect(APP_NAVIGATION).toEqual([
      { href: "/", label: "首页", icon: "home" },
      { href: "/memories", label: "回忆", icon: "memories" },
      { href: "/journal", label: "日记", icon: "journal" },
      { href: "/calendar", label: "日历", icon: "calendar" },
      { href: "/settings", label: "设置", icon: "settings" },
    ]);
    expect(APP_NAVIGATION.map(({ href }) => String(href))).not.toContain("/mood");
  });
});
