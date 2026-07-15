import { isSafeLetterImageSource } from "@/features/letters/editor/block-ids";

export const RICH_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
  "image",
] as const);

const FLOW_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "horizontalRule",
  "image",
]);
const INLINE_TYPES = new Set(["text", "hardBreak"]);
const BASIC_MARK_TYPES = new Set(["bold", "italic", "strike", "code"]);
const NODE_FIELDS = new Set(["type", "attrs", "content", "marks", "text"]);
const MARK_FIELDS = new Set(["type", "attrs"]);
const BLOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_DOCUMENT_DEPTH = 32;
const MAX_DOCUMENT_NODES = 10_000;
const MAX_DOCUMENT_TEXT = 100_000;

export type SafeRichMark = { type: "bold" | "italic" | "strike" | "code" };
export type SafeRichNode = {
  type: "doc" | "paragraph" | "heading" | "blockquote" | "codeBlock" |
    "bulletList" | "orderedList" | "listItem" | "horizontalRule" | "image" |
    "text" | "hardBreak";
  attrs?: Record<string, unknown>;
  content?: SafeRichNode[];
  marks?: SafeRichMark[];
  text?: string;
};

export type ParsedRichLetterDocument = {
  ok: true;
  document: SafeRichNode & { type: "doc" };
  hasStableBlockIds: boolean;
  blockText: Map<string, string>;
};

export type RichLetterParseResult = ParsedRichLetterDocument | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyChildren(node: Record<string, unknown>, allowed: Set<string>) {
  if (node.content === undefined) return true;
  return Array.isArray(node.content) &&
    node.content.every((child) => isRecord(child) && typeof child.type === "string" && allowed.has(child.type));
}

function validStructure(node: Record<string, unknown>) {
  if (node.type === "doc" || node.type === "blockquote") {
    return Array.isArray(node.content) && node.content.length > 0 && hasOnlyChildren(node, FLOW_BLOCK_TYPES);
  }
  if (node.type === "paragraph" || node.type === "heading") return hasOnlyChildren(node, INLINE_TYPES);
  if (node.type === "codeBlock") return hasOnlyChildren(node, new Set(["text"]));
  if (node.type === "bulletList" || node.type === "orderedList") {
    return Array.isArray(node.content) && hasOnlyChildren(node, new Set(["listItem"])) && node.content.length > 0;
  }
  if (node.type === "listItem") {
    return (
      Array.isArray(node.content) &&
      node.content.length > 0 &&
      isRecord(node.content[0]) &&
      node.content[0].type === "paragraph" &&
      node.content.every((child) => isRecord(child) && typeof child.type === "string" && FLOW_BLOCK_TYPES.has(child.type))
    );
  }
  if (node.type === "text" || node.type === "hardBreak" || node.type === "horizontalRule" || node.type === "image") {
    return node.content === undefined;
  }
  return false;
}

export function parseRichLetterDocument(value: unknown): RichLetterParseResult {
  if (!isRecord(value) || value.type !== "doc") return { ok: false };

  const blockText = new Map<string, string>();
  let nodeCount = 0;
  let textLength = 0;
  let valid = true;

  const visit = (nodeValue: unknown, depth: number): string => {
    if (!valid || depth > MAX_DOCUMENT_DEPTH || !isRecord(nodeValue)) {
      valid = false;
      return "";
    }
    nodeCount += 1;
    if (
      nodeCount > MAX_DOCUMENT_NODES ||
      Object.keys(nodeValue).some((key) => !NODE_FIELDS.has(key)) ||
      typeof nodeValue.type !== "string" ||
      !(nodeValue.type === "doc" || RICH_BLOCK_TYPES.has(nodeValue.type as never) || INLINE_TYPES.has(nodeValue.type)) ||
      !validStructure(nodeValue)
    ) {
      valid = false;
      return "";
    }

    if (nodeValue.attrs !== undefined && !isRecord(nodeValue.attrs)) {
      valid = false;
      return "";
    }
    const attrs = isRecord(nodeValue.attrs) ? nodeValue.attrs : undefined;
    if ((nodeValue.type === "doc" || nodeValue.type === "hardBreak") && attrs !== undefined) {
      valid = false;
      return "";
    }
    const hasBlockId = Boolean(attrs && Object.hasOwn(attrs, "blockId"));
    if (hasBlockId && !RICH_BLOCK_TYPES.has(nodeValue.type as never)) {
      valid = false;
      return "";
    }
    const blockId = hasBlockId ? attrs?.blockId : undefined;
    if (blockId !== undefined && (typeof blockId !== "string" || !BLOCK_ID_PATTERN.test(blockId))) {
      valid = false;
      return "";
    }

    if (nodeValue.type === "heading" && attrs?.level !== undefined) {
      if (!Number.isInteger(attrs.level) || Number(attrs.level) < 1 || Number(attrs.level) > 6) {
        valid = false;
        return "";
      }
    }
    if (nodeValue.type === "orderedList" && attrs?.start !== undefined) {
      if (!Number.isInteger(attrs.start) || Number(attrs.start) < 1) {
        valid = false;
        return "";
      }
    }
    if (nodeValue.type === "image") {
      if (!attrs || !isSafeLetterImageSource(attrs.src)) {
        valid = false;
        return "";
      }
      if (attrs.alt !== undefined && (typeof attrs.alt !== "string" || attrs.alt.length > 1_000)) {
        valid = false;
        return "";
      }
      if (attrs.layout !== undefined && attrs.layout !== "wide" && attrs.layout !== "compact") {
        valid = false;
        return "";
      }
    }

    if (nodeValue.type !== "text" && nodeValue.marks !== undefined) {
      valid = false;
      return "";
    }
    if (nodeValue.type === "text") {
      if (typeof nodeValue.text !== "string" || nodeValue.attrs !== undefined) {
        valid = false;
        return "";
      }
      if (nodeValue.marks !== undefined) {
        if (!Array.isArray(nodeValue.marks) || nodeValue.marks.some((mark) =>
          !isRecord(mark) ||
          Object.keys(mark).some((key) => !MARK_FIELDS.has(key)) ||
          !BASIC_MARK_TYPES.has(String(mark.type)) ||
          (mark.attrs !== undefined && !isRecord(mark.attrs))
        )) {
          valid = false;
          return "";
        }
      }
      textLength += nodeValue.text.length;
      if (textLength > MAX_DOCUMENT_TEXT) valid = false;
      return nodeValue.text;
    }
    if (nodeValue.text !== undefined) {
      valid = false;
      return "";
    }

    const parts: string[] = [];
    for (const child of Array.isArray(nodeValue.content) ? nodeValue.content : []) {
      parts.push(visit(child, depth + 1));
      if (!valid) return "";
    }
    const flattened = parts.join("");
    if (typeof blockId === "string") {
      if (blockText.has(blockId)) {
        valid = false;
        return "";
      }
      blockText.set(blockId, flattened);
    }
    return flattened;
  };

  visit(value, 0);
  if (!valid) return { ok: false };
  return {
    ok: true,
    document: value as SafeRichNode & { type: "doc" },
    hasStableBlockIds: blockText.size > 0,
    blockText,
  };
}
