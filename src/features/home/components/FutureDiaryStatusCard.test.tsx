import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FutureDiaryStatusCard, selectHomepageFutureDiary } from "./FutureDiaryStatusCard";

afterEach(cleanup);

describe("FutureDiaryStatusCard", () => {
  it("renders only safe waiting metadata", () => {
    render(<FutureDiaryStatusCard entry={{ id: "entry-1", authorName: "小丹", state: "waiting", openAt: "2026-08-01T12:00:00Z" }} />);
    expect(screen.getByText(/小丹/)).toBeVisible();
    expect(screen.getByText(/后开启/)).toBeVisible();
    expect(screen.queryByText("未来日记的标题")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/content|image_path|private-photo/);
  });

  it("chooses the nearest ready entry before every waiting entry", () => {
    expect(selectHomepageFutureDiary([
      { id: "waiting", authorName: "A", state: "waiting", openAt: "2026-07-24T00:00:00Z" },
      { id: "ready-later", authorName: "B", state: "ready", openAt: "2026-07-23T02:00:00Z" },
      { id: "ready-nearest", authorName: "C", state: "ready", openAt: "2026-07-23T01:00:00Z" },
    ])?.id).toBe("ready-nearest");
  });
});
