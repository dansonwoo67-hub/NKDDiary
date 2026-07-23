import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MonthHeatmap } from "./MonthHeatmap";

const state = { year: 2026, month: 7, days: [{ date: "2026-07-23", dayOfMonth: 23, recordCount: 1, events: [] }] };
afterEach(cleanup);

describe("MonthHeatmap", () => {
  it("links days to the rebuilt filtered journal view", () => {
    render(<MonthHeatmap state={state} compact={false} />);
    expect(screen.getByRole("link", { name: "23" })).toHaveAttribute("href", "/journal?date=2026-07-23");
  });

  it("makes compact preference observable in density", () => {
    const { rerender } = render(<MonthHeatmap state={state} compact={false} />);
    expect(screen.getByTestId("month-grid")).toHaveAttribute("data-density", "comfortable");
    rerender(<MonthHeatmap state={state} compact />);
    expect(screen.getByTestId("month-grid")).toHaveAttribute("data-density", "compact");
  });
});
