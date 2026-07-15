export type RichLetterMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type RichLetterNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichLetterNode[];
  marks?: RichLetterMark[];
  text?: string;
};

export type RichLetterDocument = RichLetterNode & {
  type: "doc";
};

export type BlockIdFactory = () => string;

const BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
  "image",
]);

const VALID_BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STABLE_LETTER_ASSET_SOURCE =
  /^\/api\/letter-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSafeLetterImageSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096 || value !== value.trim()) {
    return false;
  }
  if (STABLE_LETTER_ASSET_SOURCE.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function defaultBlockIdFactory() {
  return globalThis.crypto.randomUUID();
}

function validBlockId(value: unknown): value is string {
  return typeof value === "string" && VALID_BLOCK_ID.test(value);
}

function nextUniqueBlockId(factory: BlockIdFactory, used: Set<string>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = factory();
    if (validBlockId(candidate) && !used.has(candidate)) {
      return candidate;
    }
  }

  const fallbackRoot = `block-${globalThis.crypto.randomUUID()}`;
  let fallback = fallbackRoot;
  let suffix = 1;
  while (used.has(fallback)) {
    fallback = `${fallbackRoot}-${suffix}`;
    suffix += 1;
  }
  return fallback;
}

/**
 * Returns a cloned TipTap document where each selectable block has a durable,
 * unique identifier. Inline text and marks are intentionally left alone.
 */
export function ensureStableBlockIds(
  document: RichLetterDocument,
  idFactory: BlockIdFactory = defaultBlockIdFactory,
): RichLetterDocument {
  const used = new Set<string>();

  const visit = (node: RichLetterNode): RichLetterNode => {
    let attrs = node.attrs ? { ...node.attrs } : undefined;

    if (BLOCK_NODE_TYPES.has(node.type)) {
      const existing = attrs?.blockId;
      const blockId =
        validBlockId(existing) && !used.has(existing)
          ? existing
          : nextUniqueBlockId(idFactory, used);
      used.add(blockId);
      attrs = { ...attrs, blockId };
    }

    return {
      ...node,
      ...(attrs ? { attrs } : {}),
      ...(node.content ? { content: node.content.map(visit) } : {}),
      ...(node.marks
        ? {
            marks: node.marks.map((mark) =>
              mark.attrs ? { ...mark, attrs: { ...mark.attrs } } : { ...mark },
            ),
          }
        : {}),
    };
  };

  return visit(document) as RichLetterDocument;
}

/**
 * Removes images that are not backed by an HTTPS storage URL. Local blob/data
 * previews never belong in persisted letter JSON; malformed legacy nodes are
 * dropped without sacrificing the surrounding prose.
 */
export function sanitizeRichLetterDocument(
  document: RichLetterDocument,
): RichLetterDocument {
  const visit = (node: RichLetterNode): RichLetterNode | null => {
    if (node.type === "image" && !isSafeLetterImageSource(node.attrs?.src)) {
      return null;
    }

    let content = node.content
      ?.map(visit)
      .filter((child): child is RichLetterNode => child !== null);

    if (
      content?.length === 0 &&
      (node.type === "doc" ||
        node.type === "listItem" ||
        node.type === "blockquote")
    ) {
      content = [{ type: "paragraph" }];
    }
    if (
      content?.length === 0 &&
      (node.type === "bulletList" || node.type === "orderedList")
    ) {
      return null;
    }

    return {
      ...node,
      ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
      ...(content ? { content } : {}),
      ...(node.marks
        ? {
            marks: node.marks.map((mark) =>
              mark.attrs ? { ...mark, attrs: { ...mark.attrs } } : { ...mark },
            ),
          }
        : {}),
    };
  };

  const sanitized = visit(document);
  if (!sanitized || sanitized.type !== "doc") {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  if (!sanitized.content || sanitized.content.length === 0) {
    return {
      ...sanitized,
      type: "doc",
      content: [{ type: "paragraph" }],
    };
  }
  return sanitized as RichLetterDocument;
}
