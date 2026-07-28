import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WritingPrompts } from "./WritingPrompts";

describe("WritingPrompts", () => {
  afterEach(cleanup);

  it("starts a journal entry without adding mood or streak fields", () => {
    render(<WritingPrompts />);
    const prompt = "今天最想告诉对方的一件小事是什么？";
    expect(screen.getByRole("link", { name: `从这个问题开始：${prompt}` })).toHaveAttribute(
      "href",
      `/journal/new?prompt=${encodeURIComponent(prompt)}`,
    );
    expect(screen.queryByText(/连续|streak|心情标签/i)).not.toBeInTheDocument();
  });
});
