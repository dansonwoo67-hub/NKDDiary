import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeHero } from "./HomeHero";

describe("HomeHero", () => {
  it("shows relationship days without repeating profile avatars", () => {
    render(<HomeHero daysTogether={296} relationshipStartedOn="2025-10-03" />);

    expect(screen.getByText("296")).toBeVisible();
    expect(screen.getByText(/2025年10月3日/)).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
