import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/interactions/actions", () => ({
  createAnnotationAction: vi.fn(),
  createReplyAction: vi.fn(),
  deleteAnnotationAction: vi.fn(),
  deleteReplyAction: vi.fn(),
}));

import { InlineAnnotationMenu } from "./InlineAnnotationMenu";

describe("InlineAnnotationMenu", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders saved body highlights and replies as text nodes", () => {
    render(
      <InlineAnnotationMenu
        entryId="11111111-1111-4111-8111-111111111111"
        content="今天一起散步"
        annotations={[{
          id: "annotation-1",
          blockId: "body",
          startOffset: 2,
          endOffset: 4,
          quotedText: "一起",
          comment: "很开心",
          authorId: "a",
          authorName: "小丹",
          createdAt: "2026-07-20T01:00:00Z",
          canManage: false,
          replies: [{ id: "reply-1", body: "我也是", authorId: "b", authorName: "对方", createdAt: "2026-07-20T02:00:00Z", canManage: false }],
        }]}
      />,
    );

    expect(screen.getByText("一起").tagName).toBe("MARK");
    expect(screen.getByText("很开心")).toBeVisible();
    expect(screen.getByText(/我也是/)).toBeVisible();
  });

  it("shows the exact cross-block warning without replacing native selection", () => {
    const { container } = render(
      <div>
        <h1 id="outside">标题</h1>
        <InlineAnnotationMenu
          entryId="11111111-1111-4111-8111-111111111111"
          content="正文"
          annotations={[]}
        />
      </div>,
    );
    const outsideText = container.querySelector("#outside")?.firstChild;
    const body = container.querySelector('[data-block-id="body"]');
    const bodyText = body?.firstChild;
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      anchorNode: outsideText,
      focusNode: bodyText,
      toString: () => "标题正文",
      removeAllRanges: vi.fn(),
    } as unknown as Selection);

    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(document, { pointerType: "mouse" });

    expect(screen.getByRole("status")).toHaveTextContent("请在同一段文字中选择内容");
  });

  it("detects a cross-block selection in the reverse direction", () => {
    const { container } = render(
      <div>
        <h1 id="outside">标题</h1>
        <InlineAnnotationMenu entryId="11111111-1111-4111-8111-111111111111" content="正文" annotations={[]} />
      </div>,
    );
    const outsideText = container.querySelector("#outside")?.firstChild;
    const body = container.querySelector('[data-block-id="body"]');
    const bodyText = body?.firstChild?.firstChild;
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      anchorNode: bodyText,
      focusNode: outsideText,
      toString: () => "正文标题",
      removeAllRanges: vi.fn(),
    } as unknown as Selection);

    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(document, { pointerType: "mouse" });
    expect(screen.getByRole("status")).toHaveTextContent("请在同一段文字中选择内容");
  });

  it("records an intermediate selectionchange without showing or focusing UI", () => {
    const { container } = render(
      <InlineAnnotationMenu entryId="11111111-1111-4111-8111-111111111111" content="正文" annotations={[]} />,
    );
    const body = container.querySelector('[data-block-id="body"]')!;
    (body as HTMLElement).focus();
    const textNode = body.firstChild?.firstChild;
    const prefix = { selectNodeContents: vi.fn(), setEnd: vi.fn(), toString: () => "" };
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      anchorNode: textNode,
      focusNode: textNode,
      rangeCount: 1,
      getRangeAt: () => ({ startContainer: textNode, startOffset: 0, toString: () => "正文", cloneRange: () => prefix }),
      toString: () => "正文",
      removeAllRanges: vi.fn(),
    } as unknown as Selection);

    document.dispatchEvent(new Event("selectionchange"));

    expect(screen.queryByRole("dialog", { name: "添加划线评注" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加评注" })).not.toBeInTheDocument();
    expect(body).toHaveFocus();
  });

  it.each(["pointerup", "keyup"])("commits a candidate on document %s", async (eventName) => {
    const { container } = render(
      <InlineAnnotationMenu entryId="11111111-1111-4111-8111-111111111111" content="正文" annotations={[]} />,
    );
    const body = container.querySelector('[data-block-id="body"]')!;
    const textNode = body.firstChild?.firstChild;
    const prefix = { selectNodeContents: vi.fn(), setEnd: vi.fn(), toString: () => "" };
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      anchorNode: textNode,
      focusNode: textNode,
      rangeCount: 1,
      getRangeAt: () => ({ startContainer: textNode, startOffset: 0, toString: () => "正文", cloneRange: () => prefix }),
      toString: () => "正文",
      removeAllRanges: vi.fn(),
    } as unknown as Selection);

    document.dispatchEvent(new Event("selectionchange"));
    if (eventName === "pointerup") fireEvent.pointerUp(document, { pointerType: "mouse" });
    else fireEvent.keyUp(document, { key: "Shift" });

    expect(await screen.findByRole("dialog", { name: "添加划线评注" })).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("评注")).toHaveFocus());
  });

  it("ignores selections wholly outside the body block after final commit", () => {
    const { container } = render(
      <div>
        <p id="outside">页面其他文字</p>
        <InlineAnnotationMenu entryId="11111111-1111-4111-8111-111111111111" content="正文" annotations={[]} />
      </div>,
    );
    const outsideText = container.querySelector("#outside")?.firstChild;
    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      anchorNode: outsideText,
      focusNode: outsideText,
      toString: () => "页面其他文字",
      removeAllRanges: vi.fn(),
    } as unknown as Selection);

    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(document, { pointerType: "mouse" });
    expect(getSelection).toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a non-focus-stealing touch trigger only after a quiet period", () => {
    vi.useFakeTimers();
    const { container } = render(
      <InlineAnnotationMenu entryId="11111111-1111-4111-8111-111111111111" content="正文" annotations={[]} />,
    );
    const body = container.querySelector('[data-block-id="body"]')!;
    (body as HTMLElement).focus();
    const textNode = body.firstChild?.firstChild;
    const prefix = { selectNodeContents: vi.fn(), setEnd: vi.fn(), toString: () => "" };
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      anchorNode: textNode,
      focusNode: textNode,
      rangeCount: 1,
      getRangeAt: () => ({ startContainer: textNode, startOffset: 0, toString: () => "正文", cloneRange: () => prefix }),
      toString: () => "正文",
      removeAllRanges: vi.fn(),
    } as unknown as Selection);

    const event = new Event("selectionchange", { cancelable: true });
    document.dispatchEvent(event);
    fireEvent.pointerUp(document, { pointerType: "touch" });

    expect(screen.queryByRole("button", { name: "添加评注" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("button", { name: "添加评注" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(body).toHaveFocus();
    expect(event.defaultPrevented).toBe(false);
  });

  it("opens the touch candidate only when its trigger is activated", () => {
    vi.useFakeTimers();
    const { container } = render(
      <InlineAnnotationMenu entryId="11111111-1111-4111-8111-111111111111" content="正文" annotations={[]} />,
    );
    const body = container.querySelector('[data-block-id="body"]')!;
    const textNode = body.firstChild?.firstChild;
    const prefix = { selectNodeContents: vi.fn(), setEnd: vi.fn(), toString: () => "" };
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      anchorNode: textNode,
      focusNode: textNode,
      rangeCount: 1,
      getRangeAt: () => ({ startContainer: textNode, startOffset: 0, toString: () => "正文", cloneRange: () => prefix }),
      toString: () => "正文",
      removeAllRanges: vi.fn(),
    } as unknown as Selection);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(document, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(400));

    fireEvent.click(screen.getByRole("button", { name: "添加评注" }));

    expect(screen.getByRole("dialog", { name: "添加划线评注" })).toBeVisible();
    expect(screen.getByLabelText("评注")).toHaveFocus();
  });

  it("supports real keyboard selection and restores focus when the dialog closes", async () => {
    render(
      <InlineAnnotationMenu entryId="11111111-1111-4111-8111-111111111111" content="今天散步" annotations={[]} />,
    );
    const keyboardBody = screen.getByLabelText("键盘选择日记正文") as HTMLTextAreaElement;
    keyboardBody.focus();
    keyboardBody.setSelectionRange(0, 2);
    fireEvent.select(keyboardBody);

    fireEvent.keyUp(document, { key: "Shift" });

    expect(await screen.findByRole("dialog", { name: "添加划线评注" })).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("评注")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(keyboardBody).toHaveFocus());
  });
});
