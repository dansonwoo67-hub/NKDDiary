import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LetterEntryModal } from "./LetterEntryModal";
import type { LetterWritingEntry } from "./entry-state";

afterEach(cleanup);

function newEntry(today = "2026-07-13"): LetterWritingEntry {
  return { availability: "new", today, initialDraft: null };
}

describe("LetterEntryModal", () => {
  it("opens from the homepage trigger and advances the daily ritual one question at a time", () => {
    render(<LetterEntryModal entry={newEntry()} />);

    fireEvent.click(screen.getByRole("button", { name: "写一封信" }));
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("2026年7月13日")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "写今天的信" }));
    expect(screen.getByRole("heading", { name: "今天的小狗心情？" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "今天吃好了吗？" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "选好了，继续" }));
    expect(screen.getByRole("heading", { name: "今天吃好了吗？" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "选好了，继续" }));
    expect(screen.getByRole("heading", { name: "今天通畅吗？" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "选好了，继续" }));
    expect(screen.getByLabelText("称呼").getAttribute("maxlength")).toBeNull();
    expect(screen.getByPlaceholderText("亲爱的老婆")).toBeTruthy();
  });

  it("skips the three questions for a future letter and hands compose state to its callback", () => {
    const onCompose = vi.fn();
    render(
      <LetterEntryModal entry={newEntry()} onCompose={onCompose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "写一封信" }));
    fireEvent.click(screen.getByRole("button", { name: "写给未来" }));

    const schedule = screen.getByLabelText("送达日期");
    expect(screen.getByText(/自动送达并向对方公开/)).toBeTruthy();
    expect(schedule.getAttribute("min")).toBe("2026-07-14T00:00");
    fireEvent.change(schedule, { target: { value: "2026-08-01T08:30" } });
    fireEvent.click(screen.getByRole("button", { name: "确认送达时间" }));

    expect(screen.queryByText("今天的小狗心情？")).toBeNull();
    fireEvent.change(screen.getByLabelText("称呼"), {
      target: { value: "亲爱的老婆" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始写信" }));

    expect(onCompose).toHaveBeenCalledTimes(1);
    expect(onCompose.mock.calls[0]?.[0]).toMatchObject({
      step: "compose",
      kind: "time_capsule",
      salutation: "亲爱的老婆",
      scheduledFor: "2026-08-01T08:30:00+08:00",
    });
  });

  it("closes with Escape and restores focus to the opening button", () => {
    render(<LetterEntryModal entry={newEntry()} />);
    const trigger = screen.getByRole("button", { name: "写一封信" });
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "关闭写信窗口" })).toBe(document.activeElement);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });

  it("keeps keyboard focus inside the dialog", () => {
    render(<LetterEntryModal entry={newEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: "写一封信" }));

    const close = screen.getByRole("button", { name: "关闭写信窗口" });
    const lastChoice = screen.getByRole("button", { name: "写给未来" });
    lastChoice.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toBe(document.activeElement);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(lastChoice).toBe(document.activeElement);
  });

  it("counts emoji as one character and rejects an eighth character", () => {
    render(<LetterEntryModal entry={newEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: "写一封信" }));
    fireEvent.click(screen.getByRole("button", { name: "写今天的信" }));
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "选好了，继续" }));
    }

    const input = screen.getByLabelText("称呼");
    const continueButton = screen.getByRole("button", { name: "开始写信" });
    fireEvent.change(input, { target: { value: "😀😀😀😀😀😀😀" } });
    expect((continueButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(input, { target: { value: "😀😀😀😀😀😀😀😀" } });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("最多 7 个字");
  });

  it("resumes a server-provided draft and preserves its persistence metadata", () => {
    const onCompose = vi.fn();
    const entry: LetterWritingEntry = {
      availability: "draft",
      today: "2026-07-13",
      initialDraft: {
        state: {
          step: "compose",
          kind: "daily",
          today: "2026-07-13",
          answers: { mood: 5, meal: 4, health: 3 },
          salutation: "老婆",
        },
        metadata: {
          id: "11111111-1111-4111-8111-111111111111",
          version: 3,
          letterDate: "2026-07-13",
          kind: "daily",
          status: "draft",
          salutation: "老婆",
          bodyJson: { type: "doc" },
          bodyText: "写了一半",
          finalLine: "",
          scheduledFor: null,
          sliders: { mood: 5, meal: 4, health: 3 },
        },
      },
    };
    render(<LetterEntryModal entry={entry} onCompose={onCompose} />);

    fireEvent.click(screen.getByRole("button", { name: "继续写今天的信" }));

    expect(screen.getByText("信纸已经铺好了")).toBeTruthy();
    expect(onCompose).toHaveBeenCalledWith(
      expect.objectContaining({ step: "compose", salutation: "老婆" }),
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        bodyText: "写了一半",
      }),
    );
  });

  it("gates published and withdrawn daily letters without opening another draft", () => {
    const { rerender } = render(
      <LetterEntryModal
        entry={{
          availability: "published",
          today: "2026-07-13",
          letterId: "letter-1",
          href: "/letters/2026-07-13",
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "查看今天的信" });
    expect(link.getAttribute("href")).toBe("/letters/2026-07-13");
    expect(screen.queryByRole("button", { name: "写一封信" })).toBeNull();

    rerender(
      <LetterEntryModal
        entry={{ availability: "withdrawn", today: "2026-07-13", letterId: "letter-1" }}
      />,
    );
    expect((screen.getByRole("button", { name: "今天的信已撤回" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("可在个人中心查看撤回记录")).toBeTruthy();
  });

  it("moves focus to each new step, then keeps the next Tab inside the dialog", () => {
    render(<LetterEntryModal entry={newEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: "写一封信" }));
    fireEvent.click(screen.getByRole("button", { name: "写今天的信" }));

    const step = screen.getByTestId("letter-step-focus");
    expect(step).toBe(document.activeElement);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "关闭写信窗口" })).toBe(document.activeElement);

    const backgroundTrigger = screen.getByRole("button", { name: "写一封信" });
    backgroundTrigger.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "关闭写信窗口" })).toBe(document.activeElement);
  });

  it("restores body overflow and associates invalid schedule feedback with its input", () => {
    document.body.style.overflow = "scroll";
    render(<LetterEntryModal entry={newEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: "写一封信" }));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "写给未来" }));

    const schedule = screen.getByLabelText("送达日期");
    fireEvent.change(schedule, { target: { value: "2026-07-13T08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "确认送达时间" }));
    expect(schedule.getAttribute("aria-invalid")).toBe("true");
    const descriptionId = schedule.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(String(descriptionId))?.textContent).toContain("今天之后");

    fireEvent.click(screen.getByRole("button", { name: "关闭写信窗口" }));
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  it("restarts a new-letter ritual after closing instead of reopening a transient step", () => {
    render(<LetterEntryModal entry={newEntry()} />);
    fireEvent.click(screen.getByRole("button", { name: "写一封信" }));
    fireEvent.click(screen.getByRole("button", { name: "写今天的信" }));
    expect(screen.getByRole("heading", { name: "今天的小狗心情？" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "关闭写信窗口" }));
    fireEvent.click(screen.getByRole("button", { name: "写一封信" }));
    expect(screen.getByRole("heading", { name: "想写一封怎样的信？" })).toBeTruthy();
  });

  it("uses only the paper dialog while composing and releases the page when minimized", () => {
    document.body.style.overflow = "auto";
    render(<LetterEntryModal entry={newEntry()} recoveryOwnerId="user-a" />);
    const homepageTrigger = screen.getByRole("button", { name: "写一封信" });
    fireEvent.click(homepageTrigger);
    fireEvent.click(screen.getByRole("button", { name: "写今天的信" }));
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "选好了，继续" }));
    }
    fireEvent.change(screen.getByLabelText("称呼"), { target: { value: "老婆" } });
    fireEvent.click(screen.getByRole("button", { name: "开始写信" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const editor = screen.getByLabelText("编辑信件正文");
    fireEvent.click(screen.getByRole("button", { name: "最小化写信窗口" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    homepageTrigger.focus();
    expect(document.activeElement).toBe(homepageTrigger);
    expect(editor.closest("[hidden]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "继续写信" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByLabelText("编辑信件正文")).toBe(editor);
    document.body.style.overflow = "";
  });
});
