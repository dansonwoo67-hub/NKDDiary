"use client";

import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  EditorContent,
  Extension,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  ensureStableBlockIds,
  isSafeLetterImageSource,
  sanitizeRichLetterDocument,
  type BlockIdFactory,
  type RichLetterDocument,
} from "./block-ids";
import { EditorToolbar } from "./EditorToolbar";
import styles from "./RichLetterEditor.module.css";

export type RichLetterEditorValue = {
  json: RichLetterDocument;
  text: string;
};

export type RichLetterEditorProps = {
  value: RichLetterDocument;
  onChange: (value: RichLetterEditorValue) => void;
  mode?: "edit" | "readonly";
  placeholder?: string;
  onRequestImage?: () => void;
  imageUploadControl?: ReactNode;
  onReady?: (editor: Editor | null) => void;
};

const BLOCK_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
  "image",
];

const BLOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function nextBlockId(used: Set<string>, idFactory: BlockIdFactory) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = idFactory();
    if (BLOCK_ID_PATTERN.test(value) && !used.has(value)) return value;
  }
  let fallback = globalThis.crypto.randomUUID();
  while (used.has(fallback)) fallback = globalThis.crypto.randomUUID();
  return fallback;
}

export function createStableBlockIdExtension(
  idFactory: BlockIdFactory = () => globalThis.crypto.randomUUID(),
) {
  return Extension.create({
    name: "stableBlockId",

    addGlobalAttributes() {
      return [
        {
          types: BLOCK_TYPES,
          attributes: {
            blockId: {
              default: null,
              parseHTML: (element) => element.getAttribute("data-block-id"),
              renderHTML: (attributes) =>
                attributes.blockId
                  ? { "data-block-id": String(attributes.blockId) }
                  : {},
            },
          },
        },
      ];
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("stableBlockIds"),
          appendTransaction: (transactions, oldState, newState) => {
            if (!transactions.some((transaction) => transaction.docChanged)) {
              return null;
            }

            const transaction = newState.tr;
            const unsafeImages: Array<{ position: number; size: number }> = [];
            newState.doc.descendants((node, position) => {
              if (
                node.type.name === "image" &&
                !isSafeLetterImageSource(node.attrs.src)
              ) {
                unsafeImages.push({ position, size: node.nodeSize });
              }
            });
            for (const image of unsafeImages.reverse()) {
              transaction.delete(image.position, image.position + image.size);
            }

            const protectedAt = new Map<
              number,
              { blockId: string; type: string }
            >();
            oldState.doc.descendants((node, position) => {
              const blockId = node.attrs.blockId;
              if (
                !BLOCK_TYPES.includes(node.type.name) ||
                typeof blockId !== "string" ||
                !BLOCK_ID_PATTERN.test(blockId)
              ) {
                return;
              }

              let mappedPosition = position;
              for (const changed of transactions) {
                mappedPosition = changed.mapping.map(mappedPosition, 1);
              }
              mappedPosition = transaction.mapping.map(mappedPosition, 1);
              const mappedNode = transaction.doc.nodeAt(mappedPosition);
              if (
                mappedNode?.type.name === node.type.name &&
                mappedNode.attrs.blockId === blockId
              ) {
                protectedAt.set(mappedPosition, {
                  blockId,
                  type: node.type.name,
                });
              }
            });

            const used = new Set(
              Array.from(protectedAt.values(), (value) => value.blockId),
            );
            const updates: Array<{ position: number; blockId: string }> = [];
            transaction.doc.descendants((node, position) => {
              if (!BLOCK_TYPES.includes(node.type.name)) return;
              const protectedNode = protectedAt.get(position);
              if (
                protectedNode?.type === node.type.name &&
                protectedNode.blockId === node.attrs.blockId
              ) {
                return;
              }

              const existing = node.attrs.blockId;
              const blockId =
                typeof existing === "string" &&
                BLOCK_ID_PATTERN.test(existing) &&
                !used.has(existing)
                  ? existing
                  : nextBlockId(used, idFactory);
              used.add(blockId);
              if (blockId !== existing) updates.push({ position, blockId });
            });

            for (const update of updates) {
              const node = transaction.doc.nodeAt(update.position);
              if (!node) continue;
              transaction.setNodeMarkup(update.position, undefined, {
                ...node.attrs,
                blockId: update.blockId,
              });
            }
            return transaction.docChanged ? transaction : null;
          },
        }),
      ];
    },
  });
}

const LetterImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alt: { default: "信中图片" },
      layout: {
        default: "wide",
        parseHTML: (element) => element.getAttribute("data-layout") || "wide",
        renderHTML: (attributes) => ({
          "data-layout": attributes.layout === "compact" ? "compact" : "wide",
        }),
      },
    };
  },
}).configure({
  allowBase64: false,
  HTMLAttributes: {
    class: "letter-paper-image",
    loading: "lazy",
  },
});

function serializeDocument(value: RichLetterDocument) {
  return JSON.stringify(value);
}

export function RichLetterEditor({
  value,
  onChange,
  mode = "edit",
  placeholder = "从这里开始，把今天慢慢写下来……",
  onRequestImage,
  imageUploadControl,
  onReady,
}: RichLetterEditorProps) {
  const readOnly = mode === "readonly";
  const [initialValue] = useState(() =>
    ensureStableBlockIds(sanitizeRichLetterDocument(value)),
  );
  const lastEmittedValue = useRef(serializeDocument(initialValue));
  const lastExternalValue = useRef(serializeDocument(value));
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit,
      createStableBlockIdExtension(),
      LetterImage,
      Placeholder.configure({ placeholder }),
    ],
    content: initialValue as JSONContent,
    editorProps: {
      attributes: {
        class: `${styles.paper} min-h-[22rem] px-5 py-7 text-[1.05rem] leading-8 text-[var(--ink)] outline-none sm:min-h-[30rem] sm:px-9 sm:py-9`,
        "aria-label": readOnly ? "信件正文" : "编辑信件正文",
        "aria-readonly": String(readOnly),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const json = ensureStableBlockIds(
        sanitizeRichLetterDocument(
          currentEditor.getJSON() as RichLetterDocument,
        ),
      );
      lastEmittedValue.current = serializeDocument(json);
      onChangeRef.current({
        json,
        text: currentEditor.getText({ blockSeparator: "\n" }),
      });
    },
  });

  useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
    }),
  });

  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || !onReady) return;
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    const externalValue = serializeDocument(value);
    if (externalValue === lastExternalValue.current) return;
    lastExternalValue.current = externalValue;

    const normalized = ensureStableBlockIds(sanitizeRichLetterDocument(value));
    const serialized = serializeDocument(normalized);
    if (
      serialized === lastEmittedValue.current ||
      serialized === serializeDocument(editor.getJSON() as RichLetterDocument)
    ) {
      return;
    }

    const previousSelection = editor.state.selection;
    editor.commands.setContent(normalized as JSONContent, { emitUpdate: false });
    const maxPosition = editor.state.doc.content.size;
    editor.commands.setTextSelection({
      from: Math.min(previousSelection.from, maxPosition),
      to: Math.min(previousSelection.to, maxPosition),
    });
    lastEmittedValue.current = serialized;
  }, [editor, value]);

  return (
    <section
      aria-label={readOnly ? "信纸预览" : "信纸编辑器"}
      className="overflow-hidden rounded-[1.75rem] border border-[rgb(71_56_45_/_13%)] bg-[rgb(255_248_234_/_94%)] shadow-[0_22px_70px_rgb(83_61_43_/_12%)]"
    >
      <EditorToolbar
        editor={editor}
        readOnly={readOnly}
        onRequestImage={onRequestImage}
        imageUploadControl={imageUploadControl}
      />
      <EditorContent editor={editor} />
    </section>
  );
}
