import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { anchorMatchesPublishedLetter } from "@/features/annotations/create-annotation-core";
import { anchorFromSelection } from "@/features/annotations/selection-anchor";
import { RichLetterBody } from "./RichLetterBody";

describe("RichLetterBody", () => {
  it("round-trips a real DOM Range through the server verifier without counting br", () => {
    const bodyJson = {
      type: "doc",
      content: [{
        type: "paragraph",
        attrs: { blockId: "p-1" },
        content: [
          { type: "text", text: "a" },
          { type: "hardBreak" },
          { type: "text", text: "😀b", marks: [{ type: "bold" }] },
        ],
      }],
    };
    const { container } = render(<RichLetterBody rootId="letter-body" bodyJson={bodyJson} bodyText="a\n😀b" />);
    const root = container.querySelector("#letter-body")!;
    const block = root.querySelector('[data-block-id="p-1"]')!;
    const first = block.firstChild!;
    const markedText = block.querySelector("strong")!.firstChild!;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(markedText, 2);

    const created = anchorFromSelection(range, root);
    expect(created).toEqual({
      ok: true,
      anchor: { blockId: "p-1", startOffset: 0, endOffset: 3, quotedText: "a😀" },
    });
    if (!created.ok) throw new Error("expected anchor");
    expect(anchorMatchesPublishedLetter({ bodyJson, bodyText: "a\n😀b" }, created.anchor)).toBe(true);
    expect(root.querySelector('[data-block-id="legacy-body"]')).toBeNull();
  });

  it("uses legacy-body only for a valid document with no stable IDs", () => {
    const { container } = render(
      <RichLetterBody
        rootId="legacy-root"
        bodyJson={{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "旧信" }] }] }}
        bodyText="旧信"
      />,
    );
    expect(container.querySelector("#legacy-root")?.getAttribute("data-block-id")).toBe("legacy-body");
  });

  it("does not silently render invalid rich JSON as legacy text", () => {
    const { container } = render(
      <RichLetterBody
        rootId="invalid-root"
        bodyJson={{ type: "doc", content: [{ type: "unknown", attrs: { blockId: "fake" } }] }}
        bodyText="不应泄露的回退正文"
      />,
    );
    expect(container.querySelector('[data-block-id="legacy-body"]')).toBeNull();
    expect(container.textContent).toContain("这封信的正文格式暂时无法显示");
    expect(container.textContent).not.toContain("不应泄露的回退正文");
  });

  it.each([
    ["missing content", { type: "doc" }],
    ["empty content", { type: "doc", content: [] }],
    ["empty blockquote", { type: "doc", content: [{ type: "blockquote", content: [] }] }],
  ])("never falls back to bodyText for %s", (_label, bodyJson) => {
    const { container } = render(
      <RichLetterBody rootId="empty-root" bodyJson={bodyJson} bodyText="不应显示的正文" />,
    );
    expect(container.querySelector('[data-block-id="legacy-body"]')).toBeNull();
    expect(container.textContent).toContain("这封信的正文格式暂时无法显示");
    expect(container.textContent).not.toContain("不应显示的正文");
  });

  it("highlights only exact attached anchors while preserving marks, emoji, and hard breaks", () => {
    const bodyJson = {
      type: "doc",
      content: [{
        type: "paragraph",
        attrs: { blockId: "p-1" },
        content: [
          { type: "text", text: "A" },
          { type: "text", text: "😀", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "BC", marks: [{ type: "italic" }] },
        ],
      }],
    };
    const annotations = [{
      id: "a-attached", blockId: "p-1", startOffset: 1, endOffset: 4,
      quotedText: "😀B", comment: "看到了", authorName: "NK", replies: [],
    }];
    const { container } = render(
      <RichLetterBody rootId="rich" bodyJson={bodyJson} bodyText="A😀\nBC" annotations={annotations} />,
    );
    const highlights = container.querySelectorAll('[data-annotation-id="a-attached"]');
    expect(highlights).toHaveLength(2);
    expect(Array.from(highlights).map((node) => node.textContent).join("")).toBe("😀B");
    expect(container.querySelector("strong [data-annotation-id]")?.textContent).toBe("😀");
    expect(container.querySelector("em [data-annotation-id]")?.textContent).toBe("B");
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("renders deterministic overlap metadata and never highlights a moved anchor", () => {
    const bodyJson = {
      type: "doc",
      content: [{ type: "paragraph", attrs: { blockId: "p-1" }, content: [{ type: "text", text: "abcdef" }] }],
    };
    const annotations = [
      { id: "b", blockId: "p-1", startOffset: 1, endOffset: 5, quotedText: "bcde", comment: "b", authorName: "B", replies: [] },
      { id: "a", blockId: "p-1", startOffset: 2, endOffset: 4, quotedText: "cd", comment: "a", authorName: "A", replies: [] },
      { id: "moved", blockId: "p-1", startOffset: 0, endOffset: 2, quotedText: "zz", comment: "m", authorName: "M", replies: [] },
    ];
    const onAnnotationClick = vi.fn();
    const { container } = render(
      <RichLetterBody rootId="rich" bodyJson={bodyJson} bodyText="abcdef" annotations={annotations} onAnnotationClick={onAnnotationClick} />,
    );
    const overlap = container.querySelector('[data-annotation-count="2"]');
    expect(overlap).not.toBeNull();
    expect(overlap?.getAttribute("data-annotation-id")).toBe("b");
    expect(overlap?.getAttribute("aria-label")).toContain("2 条评点");
    fireEvent.click(overlap!);
    expect(onAnnotationClick).toHaveBeenCalledWith("b", ["b", "a"], expect.anything());
    expect(container.querySelector('[data-annotation-id="moved"]')).toBeNull();
  });
});
