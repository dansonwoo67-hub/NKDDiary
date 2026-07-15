import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anchorMatchesPublishedLetter } from "@/features/annotations/create-annotation-core";
import { anchorFromSelection } from "@/features/annotations/selection-anchor";
import type { ReaderLetter } from "@/features/letters/queries";
import { LetterReader } from "./LetterReader";

const mocks = vi.hoisted(() => ({
  toggleWholeLetterBookmarkAction: vi.fn(),
  createBookmarkAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/features/bookmarks/actions", () => ({
  toggleWholeLetterBookmarkAction: mocks.toggleWholeLetterBookmarkAction,
  createBookmarkAction: mocks.createBookmarkAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/letters/components/SevenCharGate", () => ({
  SevenCharGate: () => <div>未展信</div>,
}));

describe("LetterReader rich body", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toggleWholeLetterBookmarkAction.mockResolvedValue({ ok: true, bookmarked: true, message: "已收藏" });
  });
  afterEach(() => cleanup());

  it("preserves stored block IDs from the reader through anchor verification", () => {
    const bodyJson = {
      type: "doc",
      content: [{
        type: "paragraph",
        attrs: { blockId: "reader-p-1" },
        content: [{ type: "text", text: "今天" }, { type: "hardBreak" }, { type: "text", text: "😀出发", marks: [{ type: "italic" }] }],
      }],
    };
    const letter: ReaderLetter = {
      id: "33333333-3333-4333-8333-333333333333",
      authorId: "22222222-2222-4222-8222-222222222222",
      authorName: "NK",
      authorAvatarUrl: null,
      letterDate: "2026-07-15",
      body: "今天\n😀出发",
      bodyJson,
      selfMoodValue: 3,
      mealValue: 3,
      healthValue: 3,
      sevenCharLine: "想你了",
      hasOpened: true,
      openResponseText: null,
      annotations: [],
      isBookmarked: false,
    };

    const { container } = render(<LetterReader letter={letter} />);
    const root = container.querySelector(`#letter-body-${letter.id}`)!;
    const block = root.querySelector('[data-block-id="reader-p-1"]')!;
    const first = block.firstChild!;
    const italic = block.querySelector("em")!.firstChild!;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(italic, 2);
    const result = anchorFromSelection(range, root);

    expect(result).toEqual({
      ok: true,
      anchor: { blockId: "reader-p-1", startOffset: 0, endOffset: 4, quotedText: "今天😀" },
    });
    if (!result.ok) throw new Error("expected anchor");
    expect(anchorMatchesPublishedLetter({ bodyJson, bodyText: letter.body }, result.anchor)).toBe(true);
  });

  it("replaces the standalone module with a header thread entry and exact inline highlight", () => {
    const letter: ReaderLetter = {
      id: "33333333-3333-4333-8333-333333333333",
      authorId: "22222222-2222-4222-8222-222222222222",
      authorName: "NK", authorAvatarUrl: null, letterDate: "2026-07-15",
      body: "今天准备出发",
      bodyJson: { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p-1" }, content: [{ type: "text", text: "今天准备出发" }] }] },
      selfMoodValue: 3, mealValue: 3, healthValue: 3, sevenCharLine: "想你了",
      hasOpened: true, openResponseText: null, isBookmarked: false,
      annotations: [{
        id: "annotation-1", blockId: "p-1", startOffset: 2, endOffset: 6,
        quotedText: "准备出发", comment: "一路平安", authorName: "Dang", replies: [],
      }],
    };
    const { container } = render(<LetterReader letter={letter} />);
    expect(container.textContent).not.toContain(["划线", "评点"].join(""));
    expect(container.textContent).not.toContain(["评点选中", "文字"].join(""));
    expect(screen.getByRole("button", { name: "评点 1" })).toBeTruthy();
    expect(container.querySelector('[data-annotation-id="annotation-1"]')?.textContent).toBe("准备出发");
    fireEvent.click(container.querySelector('[data-annotation-id="annotation-1"]')!);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("一路平安")).toBeTruthy();
  });

  it("toggles the whole-letter bookmark once and exposes a clear pressed state", async () => {
    const letter: ReaderLetter = {
      id: "33333333-3333-4333-8333-333333333333",
      authorId: "22222222-2222-4222-8222-222222222222",
      authorName: "NK", authorAvatarUrl: null, letterDate: "2026-07-15",
      body: "正文", bodyJson: { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p-1" }, content: [{ type: "text", text: "正文" }] }] },
      selfMoodValue: 3, mealValue: 3, healthValue: 3, sevenCharLine: "想你了",
      hasOpened: true, openResponseText: null, annotations: [], isBookmarked: false,
    };
    render(<LetterReader letter={letter} />);
    const button = screen.getByRole("button", { name: "收藏整封信" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.toggleWholeLetterBookmarkAction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "取消整封信收藏" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("derives an open thread from refreshed letter annotations instead of a stale snapshot", () => {
    const annotation = {
      id: "annotation-refresh", blockId: "p-1", startOffset: 0, endOffset: 4,
      quotedText: "body", comment: "original comment", authorName: "NK", replies: [],
    };
    const letter: ReaderLetter = {
      id: "33333333-3333-4333-8333-333333333333",
      authorId: "22222222-2222-4222-8222-222222222222",
      authorName: "NK", authorAvatarUrl: null, letterDate: "2026-07-15",
      body: "body", bodyJson: { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p-1" }, content: [{ type: "text", text: "body" }] }] },
      selfMoodValue: 3, mealValue: 3, healthValue: 3, sevenCharLine: "miss you",
      hasOpened: true, openResponseText: null, isBookmarked: false, annotations: [annotation],
    };
    const view = render(<LetterReader letter={letter} />);
    fireEvent.click(view.container.querySelector('[data-annotation-id="annotation-refresh"]')!);
    expect(screen.getByText("original comment")).toBeTruthy();

    view.rerender(<LetterReader letter={{
      ...letter,
      annotations: [{
        ...annotation,
        replies: [{ id: "reply-refresh", body: "fresh reply", authorName: "Dang" }],
      }],
    }} />);

    expect(screen.getByText("fresh reply")).toBeTruthy();
  });

  it("recovers when whole-letter bookmark submission throws", async () => {
    mocks.toggleWholeLetterBookmarkAction.mockRejectedValue(new Error("offline"));
    const letter: ReaderLetter = {
      id: "33333333-3333-4333-8333-333333333333", authorId: "22222222-2222-4222-8222-222222222222",
      authorName: "NK", authorAvatarUrl: null, letterDate: "2026-07-15", body: "正文",
      bodyJson: { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p-1" }, content: [{ type: "text", text: "正文" }] }] },
      selfMoodValue: 3, mealValue: 3, healthValue: 3, sevenCharLine: "想你了", hasOpened: true,
      openResponseText: null, annotations: [], isBookmarked: false,
    };
    render(<LetterReader letter={letter} />);
    fireEvent.click(screen.getByRole("button", { name: "收藏整封信" }));
    expect(await screen.findByText("收藏失败，请稍后再试。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "收藏整封信" }).hasAttribute("disabled")).toBe(false);
  });
});
