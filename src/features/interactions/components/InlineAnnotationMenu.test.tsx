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

    fireEvent.mouseUp(body!);

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

    fireEvent.mouseUp(body!);
    expect(screen.getByRole("status")).toHaveTextContent("请在同一段文字中选择内容");
  });

  it("offers a keyboard action and moves focus into the annotation dialog", async () => {
    const { container } = render(
      <InlineAnnotationMenu entryId="11111111-1111-4111-8111-111111111111" content="正文" annotations={[]} />,
    );
    const body = container.querySelector('[data-block-id="body"]')!;
    expect(body).toHaveAttribute("tabindex", "0");
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

    fireEvent.click(screen.getByRole("button", { name: "评注选中文字" }));

    const input = await screen.findByLabelText("评注");
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("ignores selections wholly outside the body block", async () => {
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

    await act(async () => document.dispatchEvent(new Event("selectionchange")));
    expect(getSelection).toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses selectionchange as a mobile fallback without cancelling native selection", async () => {
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

    const event = new Event("selectionchange", { cancelable: true });
    document.dispatchEvent(event);

    expect(await screen.findByRole("dialog", { name: "添加划线评注" })).toBeVisible();
    expect(event.defaultPrevented).toBe(false);
  });
});
