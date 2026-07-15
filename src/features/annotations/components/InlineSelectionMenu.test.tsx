import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createBookmarkAction: vi.fn() }));
vi.mock("@/features/bookmarks/actions", () => ({ createBookmarkAction: mocks.createBookmarkAction }));

import { InlineSelectionMenu } from "./InlineSelectionMenu";

const LETTER_ID = "22222222-2222-4222-8222-222222222222";

function selectedRoot(rect = { left: 120, right: 200, top: 180, bottom: 205, width: 80, height: 25 }) {
  const root = document.createElement("div");
  root.innerHTML = '<p data-block-id="p-1">今天准备出发</p>';
  document.body.append(root);
  const range = document.createRange();
  range.setStart(root.querySelector("p")!.firstChild!, 2);
  range.setEnd(root.querySelector("p")!.firstChild!, 6);
  Object.defineProperty(range, "getBoundingClientRect", {
    value: () => rect,
  });
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return { root, ref: { current: root } as React.RefObject<HTMLDivElement | null> };
}

function pointerEvent(type: string, pointerType: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

describe("InlineSelectionMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createBookmarkAction.mockResolvedValue({ ok: true, message: "已收藏" });
  });
  afterEach(() => {
    cleanup();
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("opens exactly comment and bookmark for keyboard selection without stealing focus", async () => {
    const focused = document.createElement("button");
    document.body.append(focused);
    focused.focus();
    const { ref } = selectedRoot();
    const onComment = vi.fn();
    render(<InlineSelectionMenu letterId={LETTER_ID} rootRef={ref} onComment={onComment} />);

    document.dispatchEvent(new Event("selectionchange"));
    await waitFor(() => expect(screen.getByRole("button", { name: "评论" })).toBeTruthy(), { timeout: 3_000 });
    expect(screen.getByRole("button", { name: "收藏" })).toBeTruthy();
    expect(within(screen.getByRole("toolbar")).getAllByRole("button")).toHaveLength(2);
    expect(document.activeElement).toBe(focused);

    fireEvent.pointerDown(screen.getByRole("button", { name: "评论" }));
    fireEvent.click(screen.getByRole("button", { name: "评论" }));
    expect(onComment).toHaveBeenCalledWith(
      { blockId: "p-1", startOffset: 2, endOffset: 6, quotedText: "准备出发" },
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }),
    );
  });

  it("prevents native context menu only for a valid mouse selection, never touch", async () => {
    const mouse = selectedRoot();
    render(<InlineSelectionMenu letterId={LETTER_ID} rootRef={mouse.ref} onComment={vi.fn()} />);
    const desktopContext = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    expect(mouse.root.dispatchEvent(desktopContext)).toBe(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "评论" })).toBeTruthy());
    cleanup();

    const touch = selectedRoot();
    render(<InlineSelectionMenu letterId={LETTER_ID} rootRef={touch.ref} onComment={vi.fn()} />);
    touch.root.dispatchEvent(pointerEvent("pointerdown", "touch"));
    const touchContext = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    expect(touch.root.dispatchEvent(touchContext)).toBe(true);
    document.dispatchEvent(new Event("selectionchange"));
    await waitFor(() => expect(screen.getByTestId("inline-selection-menu").getAttribute("data-touch")).toBe("true"));
    fireEvent.keyDown(document, { key: "ArrowRight", shiftKey: true });
    document.dispatchEvent(new Event("selectionchange"));
    await waitFor(() => expect(screen.getByTestId("inline-selection-menu").getAttribute("data-touch")).toBe("false"));
  });

  it("submits an excerpt bookmark once, reports success, and dismisses", async () => {
    const { ref } = selectedRoot();
    render(<InlineSelectionMenu letterId={LETTER_ID} rootRef={ref} onComment={vi.fn()} />);
    document.dispatchEvent(new Event("selectionchange"));
    const button = await screen.findByRole("button", { name: "收藏" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.createBookmarkAction).toHaveBeenCalledTimes(1));
    expect(mocks.createBookmarkAction).toHaveBeenCalledWith({
      letterId: LETTER_ID, blockId: "p-1", startOffset: 2, endOffset: 6, quotedText: "准备出发",
    });
    expect(await screen.findByText("已收藏")).toBeTruthy();
    expect(screen.queryByTestId("inline-selection-menu")).toBeNull();
  });

  it("cleans listeners and scheduled animation frames on unmount", () => {
    const { root, ref } = selectedRoot();
    const removeRoot = vi.spyOn(root, "removeEventListener");
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const view = render(<InlineSelectionMenu letterId={LETTER_ID} rootRef={ref} onComment={vi.fn()} />);
    document.dispatchEvent(new Event("selectionchange"));
    view.unmount();
    expect(removeRoot).toHaveBeenCalledWith("contextmenu", expect.any(Function));
    expect(removeRoot).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(cancel).toHaveBeenCalled();
  });

  it("keeps the selection action available when bookmark submission throws", async () => {
    mocks.createBookmarkAction.mockRejectedValue(new Error("offline"));
    const { ref } = selectedRoot();
    render(<InlineSelectionMenu letterId={LETTER_ID} rootRef={ref} onComment={vi.fn()} />);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "收藏" }));
    expect(await screen.findByText("收藏失败，请稍后再试。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "收藏" })).toBeTruthy();
  });

  it("measures the rendered menu and reclamps it at the right edge after resize", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 300 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "toolbar") {
        return { left: 0, right: 220, top: 0, bottom: 52, width: 220, height: 52, x: 0, y: 0, toJSON: () => ({}) };
      }
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    const { ref } = selectedRoot({ left: 260, right: 290, top: 180, bottom: 205, width: 30, height: 25 });
    render(<InlineSelectionMenu letterId={LETTER_ID} rootRef={ref} onComment={vi.fn()} />);
    document.dispatchEvent(new Event("selectionchange"));
    const menu = await screen.findByRole("toolbar");
    await waitFor(() => expect(menu.style.left).toBe("72px"));

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 260 });
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(menu.style.left).toBe("32px"));
    measure.mockRestore();
  });
});
