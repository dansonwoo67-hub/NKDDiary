import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/journal/future",
}));

import { AppBottomNav } from "./AppBottomNav";

describe("AppBottomNav", () => {
  afterEach(cleanup);

  it("marks the matching product area and keeps mood out of primary navigation", () => {
    render(<AppBottomNav />);

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(navigation).toBeVisible();
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "日记" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "心情" })).not.toBeInTheDocument();
  });
});
