import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeartCalendar, type HeartCalendarDayView } from "./HeartCalendar";

const days: HeartCalendarDayView[] = [
  { date: "2026-07-01", dayOfMonth: 1, monthLabel: "七月", heartState: "a", envelopeCount: 0, events: [] },
  { date: "2026-07-02", dayOfMonth: 2, monthLabel: null, heartState: "b", envelopeCount: 1, events: [] },
  { date: "2026-07-03", dayOfMonth: 3, monthLabel: null, heartState: "both", envelopeCount: 0, events: [] },
  { date: "2026-07-04", dayOfMonth: 4, monthLabel: null, heartState: "private", envelopeCount: 0, events: [] },
];

describe("HeartCalendar", () => {
  it("switches views and opens the selected day actions", () => {
    render(<HeartCalendar initialView="month" days={days} />);

    expect(screen.getByTestId("heart-strip").getAttribute("data-view")).toBe("month");
    fireEvent.click(screen.getByRole("button", { name: "季度" }));
    expect(screen.getByTestId("heart-strip").getAttribute("data-view")).toBe("quarter");

    fireEvent.click(screen.getByLabelText("2026年7月3日"));
    expect(screen.getByRole("button", { name: "添加事件" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看当日内容" }).getAttribute("href")).toBe("/letters/2026-07-03");
  });
});
