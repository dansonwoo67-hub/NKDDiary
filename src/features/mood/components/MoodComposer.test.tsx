import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoodComposer } from "./MoodComposer";

describe("MoodComposer", () => {
  afterEach(cleanup);

  it("uses one input and enforces the 15-grapheme limit", () => {
    render(<MoodComposer />);

    const input = screen.getByRole("textbox", { name: "此刻心情" });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText("0/15")).toBeVisible();
    expect(screen.getByRole("button", { name: "记下心情" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "想你了🥰" } });
    expect(screen.getByText("4/15")).toBeVisible();
    expect(screen.getByRole("button", { name: "记下心情" })).toBeEnabled();

    fireEvent.change(input, { target: { value: "心".repeat(16) } });
    expect(screen.getByText("16/15")).toBeVisible();
    expect(screen.getByRole("button", { name: "记下心情" })).toBeDisabled();
  });

  it("shows a completion message, clears the input, and blocks duplicate submits while saving", async () => {
    let resolveAction: (value: { ok: boolean; message: string }) => void = () => undefined;
    const action = vi.fn(() => new Promise<{ ok: boolean; message: string }>((resolve) => {
      resolveAction = resolve;
    }));

    render(<MoodComposer action={action} />);
    const input = screen.getByRole("textbox", { name: "此刻心情" });
    const button = screen.getByRole("button", { name: "记下心情" });

    fireEvent.change(input, { target: { value: "今天很好" } });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: "正在保存…" })).toBeDisabled());
    expect(action).toHaveBeenCalledTimes(1);

    resolveAction({ ok: true, message: "心情已记下。" });

    await waitFor(() => expect(screen.getByText("心情已记下。")).toBeVisible());
    expect(input).toHaveValue("");
  });

});
