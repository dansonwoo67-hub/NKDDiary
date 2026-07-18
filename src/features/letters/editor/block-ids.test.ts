import { describe, expect, it } from "vitest";

import {
  ensureStableBlockIds,
  sanitizeRichLetterDocument,
  type RichLetterDocument,
} from "./block-ids";

function sequentialIds(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

describe("ensureStableBlockIds", () => {
  it("keeps existing block ids and fills every selectable block recursively", () => {
    const document: RichLetterDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "kept-paragraph" },
          content: [{ type: "text", text: "开头" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "清单" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const first = ensureStableBlockIds(
      document,
      sequentialIds("list", "item", "nested-paragraph"),
    );
    const second = ensureStableBlockIds(first, () => "should-not-be-used");

    expect(second).toEqual(first);
    expect(first.content?.[0].attrs?.blockId).toBe("kept-paragraph");
    expect(first.content?.[1].attrs?.blockId).toBe("list");
    expect(first.content?.[1].content?.[0].attrs?.blockId).toBe("item");
    expect(first.content?.[1].content?.[0].content?.[0].attrs?.blockId).toBe(
      "nested-paragraph",
    );
    expect(first.content?.[0].content?.[0].attrs).toBeUndefined();
  });

  it("normalizes duplicate and invalid ids without mutating its input", () => {
    const document: RichLetterDocument = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { blockId: "same" } },
        { type: "paragraph", attrs: { blockId: "same" } },
        { type: "paragraph", attrs: { blockId: "   " } },
      ],
    };

    const result = ensureStableBlockIds(
      document,
      sequentialIds("same", "replacement-1", "replacement-2"),
    );

    expect(result).not.toBe(document);
    expect(result.content?.map((node) => node.attrs?.blockId)).toEqual([
      "same",
      "replacement-1",
      "replacement-2",
    ]);
    expect(document.content?.[1].attrs?.blockId).toBe("same");
  });

  it("leaves document roots, inline text, hard breaks, and marks untouched", () => {
    const document: RichLetterDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "想你", marks: [{ type: "bold" }] },
            { type: "hardBreak" },
          ],
        },
      ],
    };

    const result = ensureStableBlockIds(document, () => "paragraph-id");

    expect(result.attrs).toBeUndefined();
    expect(result.content?.[0].content).toEqual(document.content?.[0].content);
    expect(result.content?.[0].content?.[0].attrs).toBeUndefined();
  });
});

describe("sanitizeRichLetterDocument", () => {
  it("removes unsafe images while preserving surrounding prose", () => {
    const document: RichLetterDocument = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "前文" }] },
        { type: "image", attrs: { src: "data:image/png;base64,abc" } },
        { type: "image", attrs: { src: "blob:https://example.com/id" } },
        { type: "image", attrs: { src: "javascript:alert(1)" } },
        { type: "image", attrs: { src: "http://example.com/plain.jpg" } },
        { type: "paragraph", content: [{ type: "text", text: "后文" }] },
      ],
    };

    const result = sanitizeRichLetterDocument(document);

    expect(result.content?.map((node) => node.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
    expect(JSON.stringify(result)).toContain("前文");
    expect(JSON.stringify(result)).toContain("后文");
    expect(JSON.stringify(result)).not.toContain("data:");
    expect(document.content).toHaveLength(6);
  });

  it("keeps only valid HTTPS image sources", () => {
    const result = sanitizeRichLetterDocument({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://project.supabase.co/storage/v1/object/sign/letter.jpg?token=x",
            alt: "旅行照片",
          },
        },
      ],
    });

    expect(result.content?.[0]).toMatchObject({
      type: "image",
      attrs: { alt: "旅行照片" },
    });
  });

  it("keeps only the stable same-origin asset route among relative sources", () => {
    const stable = "/api/letter-assets/33333333-3333-4333-8333-333333333333";
    const result = sanitizeRichLetterDocument({
      type: "doc",
      content: [
        { type: "image", attrs: { src: stable } },
        { type: "image", attrs: { src: "/uploads/photo.webp" } },
        { type: "image", attrs: { src: `${stable}?token=secret` } },
        { type: "image", attrs: { src: "data:image/webp;base64,abc" } },
      ],
    });

    expect(result.content).toHaveLength(1);
    expect(result.content?.[0].attrs?.src).toBe(stable);
  });
});
