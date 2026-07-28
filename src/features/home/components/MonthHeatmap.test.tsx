import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MonthHeatmap } from "./MonthHeatmap";

const state = { year: 2026, month: 7, days: [{ date: "2026-07-23", dayOfMonth: 23, recordCount: 1, events: [] }] };
afterEach(cleanup);

describe("MonthHeatmap", () => {
  it("expands a day in place instead of navigating to a filtered journal view", () => {
    render(<MonthHeatmap state={state} compact={false} />);
    const day = screen.getByText("23").closest("details");

    expect(day).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("23"));
    expect(day).toHaveAttribute("open");
    expect(screen.queryByRole("link", { name: "23" })).not.toBeInTheDocument();
  });

  it("uses the compact preference to reduce the visible grid gap", () => {
    const { rerender } = render(<MonthHeatmap state={state} compact={false} />);
    expect(screen.getByTestId("month-grid")).toHaveClass("gap-2");
    expect(screen.getByTestId("month-grid")).not.toHaveClass("gap-1");

    rerender(<MonthHeatmap state={state} compact />);
    expect(screen.getByTestId("month-grid")).toHaveClass("gap-1");
    expect(screen.getByTestId("month-grid")).not.toHaveClass("gap-2");
  });
});
