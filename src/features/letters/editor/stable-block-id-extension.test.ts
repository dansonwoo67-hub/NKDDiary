import { Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";

import { createStableBlockIdExtension } from "./RichLetterEditor";

const editors: Editor[] = [];

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

function idFactory() {
  let index = 0;
  return () => `generated-${++index}`;
}

function createEditor(content: Record<string, unknown>) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, createStableBlockIdExtension(idFactory())],
    content,
  });
  editors.push(editor);
  return editor;
}

function topLevelIds(editor: Editor) {
  return editor.getJSON().content?.map((node) => node.attrs?.blockId);
}

describe("stable block ID transaction extension", () => {
  it("protects the mapped original when a duplicate is inserted before it", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "original" },
          content: [{ type: "text", text: "原段" }],
        },
      ],
    });
    const duplicate = editor.schema.nodeFromJSON({
      type: "paragraph",
      attrs: { blockId: "original" },
      content: [{ type: "text", text: "副本" }],
    });

    editor.view.dispatch(editor.state.tr.insert(0, duplicate));

    expect(topLevelIds(editor)).toEqual(["generated-1", "original"]);
  });

  it("keeps the original ID across split and merge while assigning the new block", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "original" },
          content: [{ type: "text", text: "想念你" }],
        },
      ],
    });

    editor.chain().setTextSelection(3).splitBlock().run();
    expect(topLevelIds(editor)).toEqual(["original", "generated-1"]);

    const secondBlockStart = editor.state.doc.child(0).nodeSize + 1;
    editor.chain().setTextSelection(secondBlockStart).joinBackward().run();
    expect(topLevelIds(editor)).toEqual(["original"]);
  });

  it("restores the same generated ID through undo and redo", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "original" },
          content: [{ type: "text", text: "第一段" }],
        },
      ],
    });
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: "paragraph",
      content: [{ type: "text", text: "新段" }],
    });
    const generated = topLevelIds(editor)?.[1];

    expect(generated).toBe("generated-1");
    expect(editor.commands.undo()).toBe(true);
    expect(topLevelIds(editor)).toEqual(["original"]);
    expect(editor.commands.redo()).toBe(true);
    expect(topLevelIds(editor)).toEqual(["original", generated]);
  });

  it("assigns unique IDs to new list wrappers, items, and paragraphs", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "original" },
          content: [{ type: "text", text: "清单" }],
        },
      ],
    });

    editor.chain().selectAll().toggleBulletList().run();
    const json = editor.getJSON();
    const ids: string[] = [];
    const visit = (node: JSONContent) => {
      if (node.type !== "doc" && node.type !== "text") {
        ids.push(String(node.attrs?.blockId));
      }
      node.content?.forEach(visit);
    };
    visit(json);

    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain("original");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id !== "undefined")).toBe(true);
  });
});
