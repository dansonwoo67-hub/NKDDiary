import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MoodCard } from "./MoodCard";

const entry = {
  id: "mood-1",
  authorId: "user-1",
  authorName: "小丹",
  content: "想你了🥰",
  createdAt: "2026-07-25T08:00:00.000Z",
};

describe("MoodCard", () => {
  afterEach(cleanup);

  it("shows edit and delete only to the author inside 24 hours", () => {
    render(<MoodCard entry={entry} viewerId="user-1" now={new Date("2026-07-26T07:00:00.000Z")} />);
    expect(screen.getByText("想你了🥰")).toBeVisible();
    expect(screen.getByRole("button", { name: "编辑心情" })).toBeVisible();
    expect(screen.getByRole("button", { name: "删除心情" })).toBeVisible();
  });

  it("is read-only for the partner and after the edit window", () => {
    const { rerender } = render(<MoodCard entry={entry} viewerId="user-2" now={new Date("2026-07-25T09:00:00.000Z")} />);
    expect(screen.queryByRole("button", { name: "编辑心情" })).not.toBeInTheDocument();
    rerender(<MoodCard entry={entry} viewerId="user-1" now={new Date("2026-07-26T08:00:00.000Z")} />);
    expect(screen.queryByRole("button", { name: "编辑心情" })).not.toBeInTheDocument();
  });
});
