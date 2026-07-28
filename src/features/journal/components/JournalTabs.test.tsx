import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JournalTabs } from "./JournalTabs";

describe("JournalTabs", () => {
  afterEach(cleanup);

  it("keeps present and future journals as two independent routes", () => {
    render(<JournalTabs active="journal" />);
    expect(screen.getByRole("link", { name: "日记" })).toHaveAttribute("href", "/journal");
    expect(screen.getByRole("link", { name: "未来日记" })).toHaveAttribute("href", "/journal/future");
    expect(screen.getByRole("link", { name: "日记" })).toHaveAttribute("aria-current", "page");
  });
});
