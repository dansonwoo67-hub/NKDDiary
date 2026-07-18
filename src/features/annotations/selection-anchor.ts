export type SelectionAnchor = {
  blockId: string;
  startOffset: number;
  endOffset: number;
  quotedText: string;
};

export type AnchorCreationResult =
  | { ok: true; anchor: SelectionAnchor }
  | { ok: false; message: string };

export type AnchorResolutionResult =
  | { ok: true; status: "attached"; range: Range }
  | { ok: true; status: "detached"; quotedText: string; message: "原文位置已变化" }
  | { ok: false; message: string };

export const BLOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const MAX_QUOTED_TEXT_LENGTH = 1_000;
const MAX_ANCHOR_OFFSET = 1_000_000;

function isInside(root: Node, node: Node) {
  return node === root || root.contains(node);
}

function nearestBlock(node: Node, root: Node): Element | null {
  let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;

  while (current && isInside(root, current)) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as Element).hasAttribute("data-block-id")) {
      return current as Element;
    }
    if (current === root) break;
    current = current.parentNode;
  }

  return null;
}

function offsetWithinBlock(block: Element, container: Node, offset: number): number | null {
  try {
    const prefix = document.createRange();
    prefix.selectNodeContents(block);
    prefix.setEnd(container, offset);
    return prefix.toString().length;
  } catch {
    return null;
  }
}

function validStoredAnchor(anchor: SelectionAnchor): boolean {
  return (
    Boolean(anchor) &&
    typeof anchor === "object" &&
    typeof anchor.blockId === "string" &&
    typeof anchor.quotedText === "string" &&
    BLOCK_ID_PATTERN.test(anchor.blockId) &&
    Number.isInteger(anchor.startOffset) &&
    Number.isInteger(anchor.endOffset) &&
    anchor.startOffset >= 0 &&
    anchor.startOffset < anchor.endOffset &&
    anchor.endOffset <= MAX_ANCHOR_OFFSET &&
    anchor.quotedText.length === anchor.endOffset - anchor.startOffset &&
    anchor.quotedText.length <= MAX_QUOTED_TEXT_LENGTH &&
    anchor.quotedText.trim().length > 0
  );
}

export function anchorFromSelection(range: Range, root: Node): AnchorCreationResult {
  if (
    range.collapsed ||
    !isInside(root, range.startContainer) ||
    !isInside(root, range.endContainer)
  ) {
    return { ok: false, message: "请先选中正文里的文字" };
  }

  const startBlock = nearestBlock(range.startContainer, root);
  const endBlock = nearestBlock(range.endContainer, root);
  if (!startBlock || !endBlock) return { ok: false, message: "请选择正文里的文字" };
  if (startBlock !== endBlock) return { ok: false, message: "请在同一段文字中选择内容" };
  if (range.cloneContents().querySelector("[data-block-id]")) {
    return { ok: false, message: "请在同一段文字中选择内容" };
  }

  const blockId = startBlock.getAttribute("data-block-id") ?? "";
  if (!BLOCK_ID_PATTERN.test(blockId)) return { ok: false, message: "这段文字暂时无法评点" };

  const quotedText = range.toString();
  if (!quotedText.trim() || quotedText.length > MAX_QUOTED_TEXT_LENGTH) {
    return { ok: false, message: "请选择 1 到 1000 个字的内容" };
  }

  const startOffset = offsetWithinBlock(startBlock, range.startContainer, range.startOffset);
  const endOffset = offsetWithinBlock(startBlock, range.endContainer, range.endOffset);
  if (
    startOffset === null ||
    endOffset === null ||
    startOffset < 0 ||
    startOffset >= endOffset ||
    endOffset > MAX_ANCHOR_OFFSET ||
    endOffset - startOffset !== quotedText.length
  ) {
    return { ok: false, message: "无法定位这段文字，请重新选择" };
  }

  return { ok: true, anchor: { blockId, startOffset, endOffset, quotedText } };
}

function findBlockById(root: Node, blockId: string): Element | null {
  if (
    root.nodeType === Node.ELEMENT_NODE &&
    (root as Element).getAttribute("data-block-id") === blockId
  ) {
    return root as Element;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    const element = node as Element;
    if (element.getAttribute("data-block-id") === blockId) return element;
    node = walker.nextNode();
  }
  return null;
}

type TextPoint = { node: Text; offset: number };

function textPointAt(block: Element, target: number, preferNextAtBoundary: boolean): TextPoint | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let item = walker.nextNode();
  while (item) {
    nodes.push(item as Text);
    item = walker.nextNode();
  }
  if (nodes.length === 0) return null;

  let consumed = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const next = consumed + node.data.length;
    if (target < next || (target === next && (!preferNextAtBoundary || index === nodes.length - 1))) {
      return { node, offset: target - consumed };
    }
    if (target === next && preferNextAtBoundary && index < nodes.length - 1) {
      return { node: nodes[index + 1], offset: 0 };
    }
    consumed = next;
  }
  return null;
}

function detached(quotedText: string): AnchorResolutionResult {
  return { ok: true, status: "detached", quotedText, message: "原文位置已变化" };
}

export function resolveAnchor(anchor: SelectionAnchor, root: Node): AnchorResolutionResult {
  if (!validStoredAnchor(anchor)) return { ok: false, message: "评点位置数据无效" };

  const block = findBlockById(root, anchor.blockId);
  if (!block) return detached(anchor.quotedText);
  const text = block.textContent ?? "";
  if (anchor.endOffset > text.length) return detached(anchor.quotedText);
  if (text.slice(anchor.startOffset, anchor.endOffset) !== anchor.quotedText) {
    return detached(anchor.quotedText);
  }

  const start = textPointAt(block, anchor.startOffset, true);
  const end = textPointAt(block, anchor.endOffset, false);
  if (!start || !end) return detached(anchor.quotedText);

  try {
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    if (range.toString() !== anchor.quotedText) return detached(anchor.quotedText);
    return { ok: true, status: "attached", range };
  } catch {
    return detached(anchor.quotedText);
  }
}
