import { describe, expect, it } from "vitest";
import { anchorFromSelection, resolveAnchor, type SelectionAnchor } from "./selection-anchor";

function makeRoot(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe("anchorFromSelection", () => {
  it("stores flattened UTF-16 offsets across nested marks", () => {
    const root = makeRoot('<p data-block-id="p-1">今天<strong>准备😀</strong><em>出发</em>去广州</p>');
    const strong = root.querySelector("strong")!.firstChild!;
    const em = root.querySelector("em")!.firstChild!;
    const range = document.createRange();
    range.setStart(strong, 0);
    range.setEnd(em, 2);

    expect(anchorFromSelection(range, root)).toEqual({
      ok: true,
      anchor: { blockId: "p-1", startOffset: 2, endOffset: 8, quotedText: "准备😀出发" },
    });
  });

  it("round-trips element-boundary endpoints and exact whitespace", () => {
    const root = makeRoot('<p data-block-id="p.2"><span> 你</span><span> 好 </span></p>');
    const block = root.firstElementChild!;
    const range = document.createRange();
    range.setStart(block, 0);
    range.setEnd(block, 2);

    const created = anchorFromSelection(range, root);
    expect(created).toEqual({
      ok: true,
      anchor: { blockId: "p.2", startOffset: 0, endOffset: 5, quotedText: " 你 好 " },
    });
    if (!created.ok) throw new Error("expected an anchor");
    const resolved = resolveAnchor(created.anchor, root);
    expect(resolved.ok && resolved.status).toBe("attached");
    if (resolved.ok && resolved.status === "attached") expect(resolved.range.toString()).toBe(" 你 好 ");
  });

  it("rejects collapsed, whitespace-only, cross-block, outside, and unsafe selections", () => {
    const root = makeRoot(
      '<p data-block-id="safe">one </p><p data-block-id="other">two</p><p data-block-id="bad id">bad</p>',
    );
    const [first, second, unsafe] = Array.from(root.children);

    const collapsed = document.createRange();
    collapsed.setStart(first.firstChild!, 1);
    collapsed.collapse(true);
    expect(anchorFromSelection(collapsed, root)).toMatchObject({ ok: false });

    const whitespace = document.createRange();
    whitespace.setStart(first.firstChild!, 3);
    whitespace.setEnd(first.firstChild!, 4);
    expect(anchorFromSelection(whitespace, root)).toMatchObject({ ok: false });

    const crossBlock = document.createRange();
    crossBlock.setStart(first.firstChild!, 0);
    crossBlock.setEnd(second.firstChild!, 1);
    expect(anchorFromSelection(crossBlock, root)).toEqual({
      ok: false,
      message: "请在同一段文字中选择内容",
    });

    const outsideNode = document.createTextNode("outside");
    document.body.append(outsideNode);
    const outside = document.createRange();
    outside.setStart(outsideNode, 0);
    outside.setEnd(outsideNode, 3);
    expect(anchorFromSelection(outside, root)).toMatchObject({ ok: false });

    const unsafeRange = document.createRange();
    unsafeRange.selectNodeContents(unsafe);
    expect(anchorFromSelection(unsafeRange, root)).toMatchObject({ ok: false });
  });

  it("rejects an element-boundary selection that spans nested stable blocks", () => {
    const root = makeRoot(
      '<li data-block-id="item-1"><p data-block-id="p-1">one</p><p data-block-id="p-2">two</p></li>',
    );
    const item = root.firstElementChild!;
    const range = document.createRange();
    range.setStart(item, 0);
    range.setEnd(item, 2);

    expect(anchorFromSelection(range, root)).toEqual({
      ok: false,
      message: "请在同一段文字中选择内容",
    });
  });
});

describe("resolveAnchor", () => {
  it("resolves a safe punctuation-bearing ID without a CSS selector", () => {
    const root = makeRoot('<p data-block-id="p:1.part">A<strong>😀B</strong>C</p>');
    const anchor: SelectionAnchor = { blockId: "p:1.part", startOffset: 1, endOffset: 4, quotedText: "😀B" };
    const result = resolveAnchor(anchor, root);

    expect(result.ok && result.status).toBe("attached");
    if (result.ok && result.status === "attached") expect(result.range.toString()).toBe("😀B");
  });

  it("returns a detached snapshot instead of highlighting changed text", () => {
    const root = makeRoot('<p data-block-id="p-1">今天已经改变</p>');
    const result = resolveAnchor(
      { blockId: "p-1", startOffset: 2, endOffset: 6, quotedText: "准备出发" },
      root,
    );

    expect(result).toEqual({
      ok: true,
      status: "detached",
      quotedText: "准备出发",
      message: "原文位置已变化",
    });
  });

  it("rejects malformed, reversed, out-of-range, and excessive anchors safely", () => {
    const root = makeRoot('<p data-block-id="p-1">hello</p>');
    const invalid = [
      { blockId: "bad id", startOffset: 0, endOffset: 1, quotedText: "h" },
      { blockId: "p-1", startOffset: 3, endOffset: 2, quotedText: "" },
      { blockId: "p-1", startOffset: 0, endOffset: 1_000_001, quotedText: "hello" },
      { blockId: "p-1", startOffset: 0, endOffset: 1001, quotedText: "x".repeat(1001) },
    ];

    for (const anchor of invalid) expect(resolveAnchor(anchor, root)).toMatchObject({ ok: false });
    expect(() => resolveAnchor(null as unknown as SelectionAnchor, root)).not.toThrow();
    expect(resolveAnchor(null as unknown as SelectionAnchor, root)).toMatchObject({ ok: false });
  });
});
