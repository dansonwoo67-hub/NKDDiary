import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FinalLineStep, validateFinalLine } from "./FinalLineStep";

afterEach(cleanup);

describe("FinalLineStep", () => {
  it("counts user-visible Unicode characters and accepts exactly seven", () => {
    expect(validateFinalLine("你🙂好呀平安到")).toBeNull();
  });

  it("reports empty, whitespace and over-seven values only when asked to validate", () => {
    expect(validateFinalLine("")).toBe("请写下最后想说的话");
    expect(validateFinalLine("   ")).toBe("请写下最后想说的话");
    expect(validateFinalLine("一二三四五六七八")).toBe("最多写7个字");

    const onChange = vi.fn();
    render(
      <FinalLineStep
        value="一二三四五六七八"
        kind="daily"
        error={null}
        onChange={onChange}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText("总而言之，我想跟你说"), {
      target: { value: "晚安" },
    });
    expect(onChange).toHaveBeenCalledWith("晚安");
  });

  it("keeps pasted over-seven text out of the autosaved draft without splitting Unicode", () => {
    const onChange = vi.fn();
    render(
      <FinalLineStep value="晚安" kind="daily" error={null} onChange={onChange} onContinue={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("总而言之，我想跟你说"), {
      target: { value: "😀😀😀😀😀😀😀😀" },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("最多写7个字");

    fireEvent.change(screen.getByLabelText("总而言之，我想跟你说"), {
      target: { value: "😀😀😀😀😀😀😀" },
    });
    expect(onChange).toHaveBeenCalledWith("😀😀😀😀😀😀😀");
  });

  it("uses the approved daily and time-capsule calls to action", () => {
    const { rerender } = render(
      <FinalLineStep value="晚安" kind="daily" error={null} onChange={vi.fn()} onContinue={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "寄出" })).toBeTruthy();

    rerender(
      <FinalLineStep
        value="晚安"
        kind="time_capsule"
        error={null}
        onChange={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "放进时间胶囊" })).toBeTruthy();
  });
});
