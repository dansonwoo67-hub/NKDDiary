import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JournalCard } from "./JournalCard";

describe("JournalCard", () => {
  afterEach(cleanup);

  it("links a journal entry point with its title and description", () => {
    render(<JournalCard href="/journal/new" title="今日日记" description="记录此刻的心情。" actionLabel="写今日日记" />);

    expect(screen.getByRole("heading", { name: "今日日记" })).toBeVisible();
    expect(screen.getByRole("link", { name: "写今日日记" })).toHaveAttribute("href", "/journal/new");
  });
});
