import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
