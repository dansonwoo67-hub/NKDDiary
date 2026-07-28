import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryTimeline } from "./MemoryTimeline";

const items = [
  { id: "1", kind: "mood" as const, title: "开心", occurredAt: "2026-07-25T02:00:00Z", authorId: "u1", authorName: "Susan" },
  { id: "2", kind: "memory" as const, title: "海边", description: "一起看海", occurredAt: "2026-07-24T02:00:00Z", authorId: "u1", authorName: "Susan", imageUrl: "https://example.com/photo.webp" },
  { id: "3", kind: "calendar" as const, title: "旅行", occurredAt: "2026-07-23T02:00:00Z", authorName: "我们" },
];

describe("MemoryTimeline", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps content visible and filters photos when IntersectionObserver is unavailable", () => {
    render(<MemoryTimeline items={items} viewerId="u1" now={new Date("2026-07-25T03:00:00Z")} />);
    expect(screen.getByText("2026年07月25日")).toBeVisible();
    expect(screen.getByText("2026年07月24日")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /照片/ }));
    expect(screen.queryByText("开心")).not.toBeInTheDocument();
    expect(screen.getByText("海边")).toBeVisible();
  });

  it("opens a detail dialog and image viewer when IntersectionObserver is unavailable", () => {
    render(<MemoryTimeline items={items} viewerId="u1" now={new Date("2026-07-25T03:00:00Z")} />);
    fireEvent.click(screen.getByRole("button", { name: "查看海边详情" }));
    const detailDialog = screen.getByRole("dialog", { name: "海边" });
    expect(detailDialog).toBeVisible();
    fireEvent.click(within(detailDialog).getByRole("button", { name: "查看海边大图" }));
    expect(screen.getByRole("dialog", { name: "海边大图" })).toBeVisible();
  });

  it("keeps month observation enabled when IntersectionObserver is available", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const Observer = vi.fn(function Observer() {
      return { observe, disconnect };
    });
    vi.stubGlobal("IntersectionObserver", Observer);

    const { unmount } = render(
      <MemoryTimeline items={items} viewerId="u1" now={new Date("2026-07-25T03:00:00Z")} />,
    );

    expect(Observer).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
