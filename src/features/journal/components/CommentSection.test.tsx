import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentSection } from "./CommentSection";

const comment = {
  id: "comment-1",
  entry_id: "entry-1",
  author_id: "author-1",
  parent_id: null,
  body: "这是一条评论",
  created_at: "2026-07-28T10:00:00.000Z",
  updated_at: "2026-07-28T10:00:00.000Z",
  editable_until: "2026-07-29T10:00:00.000Z",
  withdrawn_at: null,
  profiles: { display_name: "Susan", avatar_url: null },
};

describe("CommentSection browser lifecycle", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("server-renders comments without reading browser globals", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("navigator", undefined);

    expect(() =>
      renderToString(
        <CommentSection entryId="entry-1" initialComments={[comment]} userId="author-1" />,
      ),
    ).not.toThrow();
  });

  it("highlights and scrolls to a hash-linked comment after client mount", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/journal/entry-1#comment-comment-1");

    render(<CommentSection entryId="entry-1" initialComments={[comment]} userId="author-1" />);

    const linkedComment = screen.getByText(comment.body).closest("#comment-comment-1");
    const scrollIntoView = vi.fn();
    Object.defineProperty(linkedComment, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    act(() => vi.advanceTimersByTime(0));
    expect(linkedComment).toHaveClass("bg-rose-50/50");
    act(() => vi.advanceTimersByTime(100));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });

    act(() => vi.advanceTimersByTime(1900));
    expect(linkedComment).not.toHaveClass("bg-rose-50/50");
  });
});
