import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const createMemoryAction = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, message: "回忆已保存。" }));
vi.mock("@/features/memories/actions", () => ({ createMemoryAction }));
vi.mock("@/features/media/ImagePicker", () => ({ ImagePicker: () => <div data-testid="single-image-picker" /> }));

import { MemoryComposer } from "./MemoryComposer";

describe("MemoryComposer", () => {
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
});
