import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublishConfirmation } from "./PublishConfirmation";

afterEach(cleanup);

describe("PublishConfirmation", () => {
  it("shows daily copy and cancels with Escape while restoring focus", () => {
    const opener = document.createElement("button");
    opener.textContent = "open";
    document.body.append(opener);
    opener.focus();
    const onCancel = vi.fn();

    const { unmount } = render(
      <PublishConfirmation kind="daily" scheduledFor={undefined} busy={false} onCancel={onCancel} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole("dialog", { name: "确认寄出这封信" })).toBeTruthy();
    expect(screen.getByText("寄出后不能修改，24小时内可以撤回。")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("shows the Shanghai delivery time for a future letter", () => {
    render(
      <PublishConfirmation
        kind="time_capsule"
        scheduledFor="2026-08-01T08:30:00+08:00"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText("将在 2026年8月1日 08:30 自动送达，送达前可以撤回或退回草稿箱。"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认放进时间胶囊" })).toBeTruthy();
  });

  it("traps focus and disables both actions while submitting", () => {
    const { rerender } = render(
      <PublishConfirmation kind="daily" scheduledFor={undefined} busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    const cancel = screen.getByRole("button", { name: "再检查一下" });
    const confirm = screen.getByRole("button", { name: "确认寄出" });
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    cancel.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    rerender(
      <PublishConfirmation kind="daily" scheduledFor={undefined} busy onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "正在寄出" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "再检查一下" })).toHaveProperty("disabled", true);
  });

  it("does not restore or steal focus when ordinary parent rerenders replace callbacks", () => {
    const { rerender } = render(
      <PublishConfirmation kind="daily" scheduledFor={undefined} busy={false} onCancel={() => undefined} onConfirm={vi.fn()} />,
    );
    const confirm = screen.getByRole("button", { name: "确认寄出" });
    confirm.focus();

    rerender(
      <PublishConfirmation kind="daily" scheduledFor={undefined} busy={false} onCancel={() => undefined} onConfirm={vi.fn()} />,
    );

    expect(document.activeElement).toBe(confirm);
  });

  it("keeps keyboard focus on the dialog panel while busy has no enabled controls", () => {
    const { rerender } = render(
      <PublishConfirmation kind="daily" scheduledFor={undefined} busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    screen.getByRole("button", { name: "确认寄出" }).focus();

    rerender(
      <PublishConfirmation kind="daily" scheduledFor={undefined} busy onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog", { name: "确认寄出这封信" });
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "确认寄出这封信" })).toBeTruthy();
  });
});
