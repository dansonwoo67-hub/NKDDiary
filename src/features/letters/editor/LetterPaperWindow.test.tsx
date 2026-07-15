import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LetterPaperWindow } from "./LetterPaperWindow";

afterEach(cleanup);

function StatefulChild() {
  return <input aria-label="正文草稿" defaultValue="还在" />;
}

function ContentEditableChild() {
  return (
    <>
      <input aria-label="正文前的输入框" />
      <div aria-label="编辑信件正文" contentEditable="true" suppressContentEditableWarning>
        正文
      </div>
    </>
  );
}

describe("LetterPaperWindow", () => {
  it("keeps editor content mounted while minimized and restores it", async () => {
    render(
      <LetterPaperWindow state="saved" recoverySafe={false} failure={null} flush={vi.fn()} onClose={vi.fn()}>
        <StatefulChild />
      </LetterPaperWindow>,
    );
    const input = await screen.findByLabelText("正文草稿");
    fireEvent.change(input, { target: { value: "我的文字" } });

    fireEvent.click(screen.getByRole("button", { name: "最小化写信窗口" }));
    expect(screen.getByRole("button", { name: "继续写信" })).toBeTruthy();
    expect(input.closest(".hidden")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "继续写信" }));
    expect((screen.getByLabelText("正文草稿") as HTMLInputElement).value).toBe("我的文字");
  });

  it("enters fullscreen, exits on Escape, and does not close the draft", async () => {
    const onClose = vi.fn();
    render(
      <LetterPaperWindow state="saved" recoverySafe={false} failure={null} flush={vi.fn()} onClose={onClose}>
        <StatefulChild />
      </LetterPaperWindow>,
    );

    await screen.findByLabelText("正文草稿");
    fireEvent.click(screen.getByRole("button", { name: "全屏写信" }));
    expect(screen.getByRole("dialog", { name: "写信信纸" }).getAttribute("data-mode")).toBe(
      "fullscreen",
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "写信信纸" }).getAttribute("data-mode")).toBe(
      "normal",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps Tab in normal mode and minimizes safely on Escape", async () => {
    render(
      <LetterPaperWindow
        state="saved"
        recoverySafe={false}
        failure={null}
        flush={vi.fn(async () => ({
          state: "saved" as const,
          recoverySafe: false,
          failure: null,
        }))}
        onClose={vi.fn()}
      >
        <StatefulChild />
      </LetterPaperWindow>,
    );
    const dialog = await screen.findByRole("dialog", { name: "写信信纸" });
    expect(document.activeElement).toBe(dialog);

    const first = screen.getByRole("button", { name: "最小化写信窗口" });
    const last = screen.getByLabelText("正文草稿");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Escape" });
    const resume = screen.getByRole("button", { name: "继续写信" });
    expect(document.activeElement).toBe(resume);
    expect(screen.queryByRole("dialog", { name: "写信信纸" })).toBeNull();
  });

  it("includes the TipTap-equivalent contenteditable as the last focus target", async () => {
    render(
      <LetterPaperWindow state="saved" recoverySafe={false} failure={null} flush={vi.fn()} onClose={vi.fn()}>
        <ContentEditableChild />
      </LetterPaperWindow>,
    );
    await screen.findByRole("dialog", { name: "写信信纸" });
    const first = screen.getByRole("button", { name: "最小化写信窗口" });
    const editor = screen.getByLabelText("编辑信件正文");

    editor.focus();
    expect(document.activeElement).toBe(editor);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(editor);
  });

  it("flushes before closing", async () => {
    const order: string[] = [];
    const flush = vi.fn(async () => {
      order.push("flush");
      return { state: "saved", recoverySafe: false, failure: null } as const;
    });
    const onClose = vi.fn(() => {
      order.push("close");
    });
    render(
      <LetterPaperWindow state="saved" recoverySafe={false} failure={null} flush={flush} onClose={onClose}>
        <StatefulChild />
      </LetterPaperWindow>,
    );

    await screen.findByLabelText("正文草稿");
    fireEvent.click(screen.getByRole("button", { name: "关闭写信窗口" }));
    await waitFor(() => expect(order).toEqual(["flush", "close"]));
  });

  it("warns before closing when only the local recovery copy is available", async () => {
    const onClose = vi.fn();
    render(
      <LetterPaperWindow
        state="offline"
        recoverySafe
        failure={{ kind: "network", message: "网络不可用" }}
        flush={vi.fn(async () => ({
          state: "offline" as const,
          recoverySafe: true,
          failure: { kind: "network" as const, message: "网络不可用" },
        }))}
        onClose={onClose}
      >
        <StatefulChild />
      </LetterPaperWindow>,
    );

    await screen.findByLabelText("正文草稿");
    fireEvent.click(screen.getByRole("button", { name: "关闭写信窗口" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByText("这次修改已保存在本机，联网后可继续。"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "仍要关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("never offers a lossy close when neither server nor local recovery is safe", async () => {
    const onClose = vi.fn();
    render(
      <LetterPaperWindow
        state="offline"
        recoverySafe={false}
        failure={{ kind: "validation", message: "正文格式不正确" }}
        flush={vi.fn(async () => ({
          state: "offline" as const,
          recoverySafe: false,
          failure: { kind: "validation" as const, message: "正文格式不正确" },
        }))}
        onClose={onClose}
      >
        <StatefulChild />
      </LetterPaperWindow>,
    );

    await screen.findByLabelText("正文草稿");
    fireEvent.click(screen.getByRole("button", { name: "关闭写信窗口" }));
    expect((await screen.findAllByText("保存失败，请勿关闭")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "仍要关闭" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
