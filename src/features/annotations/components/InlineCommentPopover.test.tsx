import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnnotationAction: vi.fn(),
  createAnnotationReplyAction: vi.fn(),
}));
vi.mock("@/features/annotations/actions", () => mocks);

import { InlineCommentPopover } from "./InlineCommentPopover";

const originalVisualViewport = window.visualViewport;

const anchor = { blockId: "p-1", startOffset: 2, endOffset: 6, quotedText: "准备出发" };
const annotation = {
  id: "annotation-1", blockId: "p-1", startOffset: 2, endOffset: 6,
  quotedText: "准备出发", comment: "我看见啦", authorName: "NK",
  replies: [{ id: "reply-1", body: "抱抱", authorName: "Dang" }],
};

describe("InlineCommentPopover", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: originalVisualViewport });
  });

  it("is safe to pre-render without a browser document", () => {
    vi.stubGlobal("document", undefined);
    try {
      expect(() => renderToString(
        <InlineCommentPopover
          mode={{ kind: "create", letterId: "22222222-2222-4222-8222-222222222222", anchor }}
          anchorRect={{ left: 120, right: 160, top: 180, bottom: 200 }} onClose={vi.fn()} onSaved={vi.fn()}
        />,
      )).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("focuses the 1000-character comment, blocks duplicate submits, and reports success", async () => {
    let finish!: (value: { ok: boolean; message: string }) => void;
    mocks.createAnnotationAction.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const onSaved = vi.fn();
    render(
      <InlineCommentPopover
        mode={{ kind: "create", letterId: "22222222-2222-4222-8222-222222222222", anchor }}
        anchorRect={{ left: 120, right: 160, top: 180, bottom: 200 }} onClose={vi.fn()} onSaved={onSaved}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "评论内容" });
    expect(document.activeElement).toBe(textarea);
    expect(textarea.getAttribute("maxlength")).toBe("1000");
    fireEvent.change(textarea, { target: { value: "今天也想你" } });
    const submit = screen.getByRole("button", { name: "留下评论" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.createAnnotationAction).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    finish({ ok: true, message: "评点已留下。" });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("contains focus for its full lifetime and restores the exact opener on Escape", () => {
    const opener = document.createElement("button");
    const background = document.createElement("button");
    document.body.append(opener);
    document.body.append(background);
    opener.focus();
    const onClose = vi.fn();
    render(
      <InlineCommentPopover
        mode={{ kind: "create", letterId: "22222222-2222-4222-8222-222222222222", anchor }}
        anchorRect={{ left: 120, right: 160, top: 180, bottom: 200 }} onClose={onClose} onSaved={vi.fn()}
      />,
    );
    const cancel = screen.getByRole("button", { name: "取消" });
    const field = screen.getByRole("textbox", { name: "评论内容" });
    background.focus();
    expect(document.activeElement).toBe(field);
    cancel.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("does not set conflicting inline left or top positioning on the mobile-safe dialog", () => {
    render(
      <InlineCommentPopover
        mode={{ kind: "create", letterId: "22222222-2222-4222-8222-222222222222", anchor }}
        anchorRect={{ left: 120, right: 160, top: 180, bottom: 200 }} onClose={vi.fn()} onSaved={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.left).toBe("");
    expect(dialog.style.top).toBe("");
  });

  it("restores the exact opener when the cancel button closes the dialog", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    render(
      <InlineCommentPopover
        mode={{ kind: "create", letterId: "22222222-2222-4222-8222-222222222222", anchor }}
        anchorRect={{ left: 120, right: 160, top: 180, bottom: 200 }} onClose={vi.fn()} onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(document.activeElement).toBe(opener);
  });

  it("repositions the measured desktop dialog on visual viewport resize and scroll", async () => {
    const viewport = Object.assign(new EventTarget(), {
      offsetLeft: 100, offsetTop: 200, width: 320, height: 480, scale: 2,
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "dialog") {
        return { left: 0, right: 384, top: 0, bottom: 300, width: 384, height: 300, x: 0, y: 0, toJSON: () => ({}) };
      }
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    render(
      <InlineCommentPopover
        mode={{ kind: "create", letterId: "22222222-2222-4222-8222-222222222222", anchor }}
        anchorRect={{ left: 380, right: 410, top: 300, bottom: 320 }} onClose={vi.fn()} onSaved={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.style.getPropertyValue("--popover-left")).toBe("108px"));
    expect(dialog.style.getPropertyValue("--popover-top")).toBe("332px");

    Object.assign(viewport, { offsetLeft: 40, offsetTop: 80, width: 600, height: 420 });
    viewport.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(dialog.style.getPropertyValue("--popover-left")).toBe("248px"));
    expect(dialog.style.getPropertyValue("--popover-top")).toBe("192px");

    Object.assign(viewport, { offsetTop: 100 });
    viewport.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(dialog.style.getPropertyValue("--popover-top")).toBe("212px"));
  });

  it("applies visual viewport width and height limits to the dialog", async () => {
    const viewport = Object.assign(new EventTarget(), {
      offsetLeft: 100, offsetTop: 200, width: 320, height: 480, scale: 2,
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "dialog") {
        return { left: 0, right: 384, top: 0, bottom: 700, width: 384, height: 700, x: 0, y: 0, toJSON: () => ({}) };
      }
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
    });

    render(
      <InlineCommentPopover
        mode={{ kind: "thread", annotation, threads: [annotation] }}
        anchorRect={{ left: 380, right: 410, top: 300, bottom: 320 }} onClose={vi.fn()} onSaved={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.style.getPropertyValue("--popover-max-width")).toBe("304px"));
    expect(dialog.style.getPropertyValue("--popover-max-height")).toBe("464px");
  });

  it("shows a saved thread and prevents duplicate reply submission", async () => {
    mocks.createAnnotationReplyAction.mockResolvedValue({ ok: true, message: "回复已发送。" });
    const onSaved = vi.fn();
    render(
      <InlineCommentPopover
        mode={{ kind: "thread", annotation, threads: [annotation] }}
        anchorRect={{ left: 120, right: 160, top: 180, bottom: 200 }} onClose={vi.fn()} onSaved={onSaved}
      />,
    );
    expect(screen.getByText("我看见啦")).toBeTruthy();
    expect(screen.getByText("抱抱")).toBeTruthy();
    const reply = screen.getByRole("textbox", { name: "回复评点" });
    fireEvent.change(reply, { target: { value: "收到" } });
    const submit = screen.getByRole("button", { name: "回复" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.createAnnotationReplyAction).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("recovers from an action exception with contextual feedback", async () => {
    mocks.createAnnotationAction.mockRejectedValue(new Error("offline"));
    render(
      <InlineCommentPopover
        mode={{ kind: "create", letterId: "22222222-2222-4222-8222-222222222222", anchor }}
        anchorRect={{ left: 120, right: 160, top: 180, bottom: 200 }} onClose={vi.fn()} onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "评论内容" }), { target: { value: "想你" } });
    fireEvent.click(screen.getByRole("button", { name: "留下评论" }));
    expect(await screen.findByText("提交失败，请稍后再试。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "留下评论" }).hasAttribute("disabled")).toBe(false);
  });
});
