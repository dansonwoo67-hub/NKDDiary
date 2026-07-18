import { describe, expect, it } from "vitest";
import { parseRichLetterDocument } from "./rich-text-schema";

describe("parseRichLetterDocument", () => {
  it("accepts supported TipTap nodes, stable block IDs, and basic marks", () => {
    const result = parseRichLetterDocument({
      type: "doc",
      content: [{
        type: "blockquote",
        attrs: { blockId: "quote-1" },
        content: [{
          type: "paragraph",
          attrs: { blockId: "p-1" },
          content: [{ type: "text", text: "hello", marks: [{ type: "bold" }, { type: "italic" }] }],
        }],
      }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hasStableBlockIds).toBe(true);
      expect(result.blockText.get("p-1")).toBe("hello");
    }
  });

  it.each([
    ["doc without content", { type: "doc" }],
    ["empty doc", { type: "doc", content: [] }],
    ["empty blockquote", { type: "doc", content: [{ type: "blockquote", content: [] }] }],
    ["unknown node", { type: "doc", content: [{ type: "script", content: [] }] }],
    ["block ID on text", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", attrs: { blockId: "fake" } }] }] }],
    ["inline child under doc", { type: "doc", content: [{ type: "text", text: "x" }] }],
    ["list without list items", { type: "doc", content: [{ type: "bulletList", content: [{ type: "paragraph", content: [] }] }] }],
    ["unknown mark", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link" }] }] }] }],
    ["unknown node field", { type: "doc", content: [{ type: "paragraph", script: "alert(1)", content: [] }] }],
    ["attrs on hard break", { type: "doc", content: [{ type: "paragraph", content: [{ type: "hardBreak", attrs: { fake: true } }] }] }],
    ["duplicate ID", { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "same" } }, { type: "heading", attrs: { blockId: "same" } }] }],
    ["unsafe image", { type: "doc", content: [{ type: "image", attrs: { blockId: "image-1", src: "javascript:alert(1)" } }] }],
  ])("rejects %s", (_label, document) => {
    expect(parseRichLetterDocument(document)).toEqual({ ok: false });
  });
});
