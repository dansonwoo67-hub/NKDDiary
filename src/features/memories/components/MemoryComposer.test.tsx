import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMemoryAction = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, message: "回忆已保存。" }));
vi.mock("@/features/memories/actions", () => ({ createMemoryAction }));
vi.mock("@/features/media/ImagePicker", () => ({ ImagePicker: () => <div data-testid="single-image-picker" /> }));

import { MemoryComposer } from "./MemoryComposer";

describe("MemoryComposer", () => {
  beforeEach(() => {
    createMemoryAction.mockReset();
    createMemoryAction.mockResolvedValue({ ok: true, message: "回忆已保存。" });
  });

  afterEach(cleanup);

  it("limits memory title and body to the short-form contract", () => {
    render(<MemoryComposer today="2026-07-25" />);
    expect(screen.getByRole("textbox", { name: "回忆标题" })).toHaveAttribute("maxlength", "30");
    expect(screen.getByRole("textbox", { name: "回忆描述" })).toHaveAttribute("maxlength", "150");
    expect(screen.getByText("0 / 150")).toBeVisible();
  });

  it("collects a memory with one optional image", async () => {
    render(<MemoryComposer today="2026-07-25" />);
    fireEvent.change(screen.getByRole("textbox", { name: "回忆标题" }), { target: { value: "海边" } });
    fireEvent.change(screen.getByRole("textbox", { name: "回忆描述" }), { target: { value: "一起看海" } });
    fireEvent.click(screen.getByRole("button", { name: "保存回忆" }));
    await waitFor(() => expect(createMemoryAction).toHaveBeenCalledOnce());
  });

  it("calls onCreated only after a successful create", async () => {
    const onCreated = vi.fn();
    render(<MemoryComposer today="2026-07-25" onCreated={onCreated} />);
    fireEvent.change(screen.getByRole("textbox", { name: "回忆描述" }), { target: { value: "一起看海" } });
    fireEvent.click(screen.getByRole("button", { name: "保存回忆" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });

  it("keeps failed input for retry and closes only after the retry succeeds", async () => {
    const onCreated = vi.fn();
    createMemoryAction
      .mockResolvedValueOnce({ ok: false, message: "保存失败，请稍后重试。" })
      .mockResolvedValueOnce({ ok: true, message: "回忆已保存。" });
    render(<MemoryComposer today="2026-07-25" onCreated={onCreated} />);

    const body = screen.getByRole("textbox", { name: "回忆描述" });
    fireEvent.change(body, { target: { value: "一起看海" } });
    fireEvent.click(screen.getByRole("button", { name: "保存回忆" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("保存失败，请稍后重试。"));
    expect(onCreated).not.toHaveBeenCalled();
    expect(body).toHaveValue("一起看海");

    fireEvent.click(await screen.findByRole("button", { name: "保存回忆" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(createMemoryAction).toHaveBeenCalledTimes(2);
  });

  it("submits only once for two synchronous submit events", async () => {
    let resolveAction!: (result: { ok: boolean; message: string }) => void;
    createMemoryAction.mockImplementation(() => new Promise((resolve) => { resolveAction = resolve; }));
    render(<MemoryComposer today="2026-07-25" />);
    fireEvent.change(screen.getByRole("textbox", { name: "回忆描述" }), { target: { value: "一起看海" } });
    const form = screen.getByRole("button", { name: "保存回忆" }).closest("form");
    if (!form) throw new Error("composer form missing");

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(createMemoryAction).toHaveBeenCalledOnce();
    resolveAction({ ok: true, message: "回忆已保存。" });
  });
});
