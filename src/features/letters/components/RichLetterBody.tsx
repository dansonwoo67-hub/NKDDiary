import { Fragment, type ReactNode, type Ref } from "react";
import {
  parseRichLetterDocument,
  type SafeRichMark,
  type SafeRichNode,
} from "@/features/letters/rich-text-schema";

export type RichLetterBodyProps = {
  rootId: string;
  bodyJson: unknown;
  bodyText: string;
  annotations?: RichBodyAnnotation[];
  onAnnotationClick?: (annotationId: string, annotationIds: string[], rect: DOMRect) => void;
  rootRef?: Ref<HTMLDivElement>;
};

export type RichBodyAnnotation = {
  id: string;
  blockId: string | null;
  startOffset: number | null;
  endOffset: number | null;
  quotedText: string;
};

type BlockRenderContext = {
  cursor: number;
  annotations: Array<RichBodyAnnotation & { blockId: string; startOffset: number; endOffset: number }>;
  onAnnotationClick?: (annotationId: string, annotationIds: string[], rect: DOMRect) => void;
};

function blockIdProps(node: SafeRichNode) {
  return typeof node.attrs?.blockId === "string"
    ? { "data-block-id": node.attrs.blockId }
    : {};
}

function markedContent(contentValue: ReactNode, marks: SafeRichMark[] | undefined, key: string): ReactNode {
  let content = contentValue;
  for (const [index, mark] of (marks ?? []).entries()) {
    const markKey = `${key}-mark-${index}`;
    if (mark.type === "bold") content = <strong key={markKey}>{content}</strong>;
    else if (mark.type === "italic") content = <em key={markKey}>{content}</em>;
    else if (mark.type === "strike") content = <s key={markKey}>{content}</s>;
    else content = <code key={markKey}>{content}</code>;
  }
  return content;
}

function annotationOrder(a: RichBodyAnnotation, b: RichBodyAnnotation) {
  return Number(a.startOffset) - Number(b.startOffset) ||
    Number(b.endOffset) - Number(a.endOffset) || a.id.localeCompare(b.id);
}

function renderText(node: SafeRichNode, path: string, context?: BlockRenderContext) {
  const text = node.text ?? "";
  if (!context || context.annotations.length === 0) {
    if (context) context.cursor += text.length;
    return <Fragment key={path}>{markedContent(text, node.marks, path)}</Fragment>;
  }
  const textStart = context.cursor;
  const textEnd = textStart + text.length;
  context.cursor = textEnd;
  const boundaries = new Set([textStart, textEnd]);
  for (const annotation of context.annotations) {
    if (annotation.startOffset > textStart && annotation.startOffset < textEnd) boundaries.add(annotation.startOffset);
    if (annotation.endOffset > textStart && annotation.endOffset < textEnd) boundaries.add(annotation.endOffset);
  }
  const points = Array.from(boundaries).sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const value = text.slice(start - textStart, end - textStart);
    const active = context.annotations
      .filter((annotation) => annotation.startOffset < end && annotation.endOffset > start)
      .sort(annotationOrder);
    let content: ReactNode = value;
    if (active.length > 0) {
      const primary = active[0];
      content = (
        <button
          key={`${path}-annotation-${start}`}
          type="button"
          data-annotation-id={primary.id}
          data-annotation-count={active.length}
          aria-label={`${value}，${active.length} 条评点`}
          onClick={(event) => context.onAnnotationClick?.(
            primary.id,
            active.map((annotation) => annotation.id),
            event.currentTarget.getBoundingClientRect(),
          )}
          className="rounded-sm bg-[rgb(222_120_133_/_18%)] px-0.5 text-inherit underline decoration-[rgb(174_78_94_/_55%)] decoration-1 underline-offset-4 transition-colors hover:bg-[rgb(222_120_133_/_28%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rose)]"
        >
          {value}
        </button>
      );
    }
    return <Fragment key={`${path}-part-${start}`}>{markedContent(content, node.marks, `${path}-${start}`)}</Fragment>;
  });
}

function renderChildren(
  node: SafeRichNode,
  path: string,
  annotationsByBlock: Map<string, BlockRenderContext["annotations"]>,
  context?: BlockRenderContext,
  onAnnotationClick?: (annotationId: string, annotationIds: string[], rect: DOMRect) => void,
) {
  return node.content?.map((child, index) =>
    renderNode(child, `${path}-${index}`, annotationsByBlock, context, onAnnotationClick)
  ) ?? null;
}

function renderNode(
  node: SafeRichNode,
  path: string,
  annotationsByBlock: Map<string, BlockRenderContext["annotations"]>,
  parentContext?: BlockRenderContext,
  onAnnotationClick?: (annotationId: string, annotationIds: string[], rect: DOMRect) => void,
): ReactNode {
  const props = blockIdProps(node);
  const blockId = typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;
  const context = blockId
    ? { cursor: 0, annotations: annotationsByBlock.get(blockId) ?? [], onAnnotationClick }
    : parentContext;
  if (node.type === "text") return renderText(node, path, context);
  if (node.type === "hardBreak") return <br key={path} />;
  if (node.type === "paragraph") return <p key={path} {...props} className="my-3 whitespace-pre-wrap">{renderChildren(node, path, annotationsByBlock, context, onAnnotationClick)}</p>;
  if (node.type === "heading") {
    const children = renderChildren(node, path, annotationsByBlock, context, onAnnotationClick);
    const level = Number(node.attrs?.level ?? 2);
    if (level === 1) return <h1 key={path} {...props} className="my-4 text-2xl font-semibold">{children}</h1>;
    if (level === 3) return <h3 key={path} {...props} className="my-4 text-xl font-semibold">{children}</h3>;
    if (level === 4) return <h4 key={path} {...props} className="my-3 text-lg font-semibold">{children}</h4>;
    if (level === 5) return <h5 key={path} {...props} className="my-3 font-semibold">{children}</h5>;
    if (level === 6) return <h6 key={path} {...props} className="my-3 text-sm font-semibold">{children}</h6>;
    return <h2 key={path} {...props} className="my-4 text-[1.35rem] font-semibold">{children}</h2>;
  }
  if (node.type === "blockquote") return <blockquote key={path} {...props} className="my-4 border-l-2 border-[rgb(71_56_45_/_25%)] pl-4 text-[var(--muted-ink)]">{renderChildren(node, path, annotationsByBlock, context, onAnnotationClick)}</blockquote>;
  if (node.type === "codeBlock") return <pre key={path} {...props} className="my-4 overflow-x-auto rounded-xl bg-[rgb(71_56_45_/_8%)] p-4"><code>{renderChildren(node, path, annotationsByBlock, context, onAnnotationClick)}</code></pre>;
  if (node.type === "bulletList") return <ul key={path} {...props} className="my-3 list-disc pl-6">{renderChildren(node, path, annotationsByBlock, context, onAnnotationClick)}</ul>;
  if (node.type === "orderedList") {
    const start = Number(node.attrs?.start ?? 1);
    return <ol key={path} start={start} {...props} className="my-3 list-decimal pl-6">{renderChildren(node, path, annotationsByBlock, context, onAnnotationClick)}</ol>;
  }
  if (node.type === "listItem") return <li key={path} {...props} className="my-1">{renderChildren(node, path, annotationsByBlock, context, onAnnotationClick)}</li>;
  if (node.type === "horizontalRule") return <hr key={path} {...props} className="my-6 border-[rgb(71_56_45_/_18%)]" />;
  if (node.type === "image") {
    const src = String(node.attrs?.src);
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "信中图片";
    const layout = node.attrs?.layout === "compact" ? "compact" : "wide";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={path} {...props} src={src} alt={alt} loading="lazy" data-layout={layout} className="letter-paper-image" />
    );
  }
  return null;
}

export function RichLetterBody({ rootId, bodyJson, bodyText, annotations = [], onAnnotationClick, rootRef }: RichLetterBodyProps) {
  const parsed = parseRichLetterDocument(bodyJson);
  const className = "mt-6 rounded-[1.5rem] bg-white/55 p-5 leading-8 text-[var(--ink)]";

  if (!parsed.ok) {
    return <div ref={rootRef} id={rootId} data-rich-text-invalid="true" className={className}>这封信的正文格式暂时无法显示</div>;
  }
  if (!parsed.hasStableBlockIds) {
    const validLegacy = annotations.filter((annotation) =>
      annotation.blockId === "legacy-body" && Number.isInteger(annotation.startOffset) &&
      Number.isInteger(annotation.endOffset) && Number(annotation.startOffset) >= 0 &&
      Number(annotation.endOffset) > Number(annotation.startOffset) &&
      bodyText.slice(Number(annotation.startOffset), Number(annotation.endOffset)) === annotation.quotedText
    ) as BlockRenderContext["annotations"];
    const context = { cursor: 0, annotations: validLegacy.sort(annotationOrder), onAnnotationClick };
    return <div ref={rootRef} id={rootId} data-block-id="legacy-body" className={`${className} whitespace-pre-wrap`}>{renderText({ type: "text", text: bodyText }, "legacy", context)}</div>;
  }
  const annotationsByBlock = new Map<string, BlockRenderContext["annotations"]>();
  for (const annotation of annotations) {
    if (!annotation.blockId || !Number.isInteger(annotation.startOffset) || !Number.isInteger(annotation.endOffset)) continue;
    const blockText = parsed.blockText.get(annotation.blockId);
    if (blockText === undefined || Number(annotation.startOffset) < 0 || Number(annotation.endOffset) <= Number(annotation.startOffset)) continue;
    if (blockText.slice(Number(annotation.startOffset), Number(annotation.endOffset)) !== annotation.quotedText) continue;
    const list = annotationsByBlock.get(annotation.blockId) ?? [];
    list.push(annotation as BlockRenderContext["annotations"][number]);
    annotationsByBlock.set(annotation.blockId, list);
  }
  for (const list of annotationsByBlock.values()) list.sort(annotationOrder);
  return (
    <div ref={rootRef} id={rootId} className={`${className} rich-letter-body`}>
      {renderChildren(parsed.document, "doc", annotationsByBlock, undefined, onAnnotationClick)}
    </div>
  );
}
