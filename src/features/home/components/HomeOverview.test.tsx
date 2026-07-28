import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeOverview } from "./HomeOverview";

describe("HomeOverview", () => {
  it("renders memories and moods as a two-sided timeline", () => {
    render(
      <HomeOverview
        currentUserId="u1"
        authorNames={{ u1: "Susan", u2: "Niki" }}
        recentMemories={[
          { id: "1", kind: "memory", title: "海边散步", description: "风很大，但很开心", occurredAt: "2026-07-25T00:00:00Z", authorId: "u1" },
          { id: "2", kind: "mood", title: "今天很想你", occurredAt: "2026-07-24T00:00:00Z", authorId: "u2" },
        ]}
      />,
    );

    expect(screen.getByText("海边散步")).toBeVisible();
    expect(screen.getByText("今天很想你")).toBeVisible();
    expect(screen.getByText("Susan")).toBeVisible();
    expect(screen.getByText("Niki")).toBeVisible();
    expect(screen.getByTestId("recent-story-line")).toBeVisible();
  });
});
