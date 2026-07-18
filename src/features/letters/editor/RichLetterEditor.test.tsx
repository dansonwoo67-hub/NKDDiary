import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { act } from "react";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RichLetterEditor } from "./RichLetterEditor";

const EMPTY_DOCUMENT = {
  type: "doc" as const,
  content: [{ type: "paragraph", attrs: { blockId: "opening" } }],
};

afterEach(cleanup);

describe("RichLetterEditor", () => {
  it("can render during SSR without constructing a browser editor", () => {
    expect(() =>
      renderToString(
        <RichLetterEditor value={EMPTY_DOCUMENT} onChange={() => undefined} />,
      ),
    ).not.toThrow();
  });

  it("exposes labeled formatting controls and the image request entry", async () => {
    const onRequestImage = vi.fn();
    render(
      <RichLetterEditor
        value={EMPTY_DOCUMENT}
        onChange={() => undefined}
        onRequestImage={onRequestImage}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("编辑信件正文")).toBeVisible());
    expect(screen.getByRole("button", { name: "加粗" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "无序列表" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "插入图片" }));
    expect(onRequestImage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "插入图片" })).not.toHaveAttribute(
      "aria-pressed",
    );
  });

  it("uses the supplied upload control as the toolbar's only image entry", async () => {
    const legacyRequest = vi.fn();
    render(
      <RichLetterEditor
        value={EMPTY_DOCUMENT}
        onChange={() => undefined}
        onRequestImage={legacyRequest}
        imageUploadControl={<button type="button">私密图片上传</button>}
      />,
    );

    await waitFor(() => expect(screen.getByText("私密图片上传")).toBeVisible());
    expect(screen.queryByRole("button", { name: "插入图片" })).not.toBeInTheDocument();
  });

  it("disables editing and all visible tools in readonly mode", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RichLetterEditor
        value={EMPTY_DOCUMENT}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("编辑信件正文")).toBeVisible());
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <RichLetterEditor
        value={EMPTY_DOCUMENT}
        onChange={onChange}
        mode="readonly"
        onRequestImage={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("信件正文")).toBeVisible());
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("信件正文")).toHaveAttribute(
      "contenteditable",
      "false",
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }

    rerender(
      <RichLetterEditor
        value={EMPTY_DOCUMENT}
        onChange={onChange}
        mode="edit"
      />,
    );
    await waitFor(() => expect(screen.getByLabelText("编辑信件正文")).toBeVisible());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sanitizes unsafe images on initial and external values", async () => {
    const unsafeInitial = {
      type: "doc" as const,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "保留我" }] },
        { type: "image", attrs: { src: "data:image/png;base64,abc" } },
      ],
    };
    const { rerender, container } = render(
      <RichLetterEditor value={unsafeInitial} onChange={() => undefined} />,
    );

    await waitFor(() => expect(screen.getByText("保留我")).toBeVisible());
    expect(container.querySelector("img")).toBeNull();

    rerender(
      <RichLetterEditor
        value={{
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "仍然保留" }] },
            { type: "image", attrs: { src: "blob:https://example.com/id" } },
          ],
        }}
        onChange={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText("仍然保留")).toBeVisible());
    expect(container.querySelector("img")).toBeNull();
  });

  it("emits sanitized JSON and newline-separated text on real editor updates", async () => {
    const onChange = vi.fn();
    let editor: Editor | null = null;
    render(
      <RichLetterEditor
        value={EMPTY_DOCUMENT}
        onChange={onChange}
        onReady={(value) => {
          editor = value;
        }}
      />,
    );

    await waitFor(() => expect(editor).not.toBeNull());
    act(() => {
      editor!.commands.setContent({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
          { type: "image", attrs: { src: "javascript:alert(1)" } },
          { type: "paragraph", content: [{ type: "text", text: "第二段" }] },
        ],
      });
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emitted = onChange.mock.calls.at(-1)?.[0];
    expect(emitted.text).toBe("第一段\n第二段");
    expect(emitted.json.content.map((node: { type: string }) => node.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
    expect(
      emitted.json.content.every(
        (node: { attrs?: { blockId?: string } }) =>
          typeof node.attrs?.blockId === "string",
      ),
    ).toBe(true);
  });

  it("updates toggle aria state after a real formatting command", async () => {
    let editor: Editor | null = null;
    render(
      <RichLetterEditor
        value={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { blockId: "format-me" },
              content: [{ type: "text", text: "想你" }],
            },
          ],
        }}
        onChange={() => undefined}
        onReady={(value) => {
          editor = value;
        }}
      />,
    );

    await waitFor(() => expect(editor).not.toBeNull());
    act(() => {
      editor!.commands.setTextSelection({ from: 1, to: 3 });
    });
    fireEvent.click(screen.getByRole("button", { name: "加粗" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "加粗" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.queryByRole("button", { name: "插入图片" })).not.toBeInTheDocument();
  });
});
