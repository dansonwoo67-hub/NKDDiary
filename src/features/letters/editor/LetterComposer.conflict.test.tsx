import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LetterRecord } from "@/features/letters/mutations";
import { LetterComposer } from "./LetterComposer";
import type { AutosaveDraft, AutosaveSaveResult } from "./useDraftAutosave";

vi.mock("./RichLetterEditor", () => ({
  RichLetterEditor: ({
    value,
    onChange,
  }: {
    value: Record<string, unknown>;
    onChange: (value: { json: Record<string, unknown>; text: string }) => void;
  }) => (
    <div>
      <output data-testid="editor-json">{JSON.stringify(value)}</output>
      <button
        type="button"
        onClick={() =>
          onChange({
            json: { type: "doc", content: [{ type: "paragraph", local: true }] },
            text: "本机正文",
          })
        }
      >
        模拟编辑正文
      </button>
    </div>
  ),
}));

const id = "11111111-1111-4111-8111-111111111111";
const state = {
  step: "compose" as const,
  today: "2026-07-15",
  kind: "daily" as const,
  salutation: "老婆",
  answers: { mood: 5, meal: 4, health: 3 },
};
const metadata = {
  id,
  version: 3,
  letterDate: "2026-07-15",
  kind: "daily" as const,
  status: "draft" as const,
  salutation: "老婆",
  bodyJson: { type: "doc", content: [] },
  bodyText: "原正文",
  finalLine: "",
  scheduledFor: null,
  sliders: { mood: 5, meal: 4, health: 3 },
};

function cloudLetter(overrides: Partial<LetterRecord> = {}): LetterRecord {
  return {
    id,
    authorId: "22222222-2222-4222-8222-222222222222",
    status: "draft",
    kind: "daily",
    version: 8,
    publishedAt: null,
    letterDate: "2026-07-15",
    salutation: "云端",
    bodyJson: { type: "doc", content: [{ type: "paragraph", cloud: true }] },
    bodyText: "云端正文",
    sevenCharLine: "",
    scheduledFor: null,
    sliders: { selfMoodValue: 3, mealValue: 3, healthValue: 3 },
    ...overrides,
  };
}

describe("LetterComposer conflict decisions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("loads and displays the authorized cloud draft instead of reloading the page", async () => {
    const saveDraft = vi.fn(async (): Promise<AutosaveSaveResult> => ({
      ok: false,
      code: "VERSION_CONFLICT",
      message: "版本冲突",
    }));
    const loadLatest = vi.fn(async () => ({ ok: true as const, letter: cloudLetter() }));
    render(
      <LetterComposer
        state={state}
        metadata={metadata}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={saveDraft}
        loadLatest={loadLatest}
        autosaveDelayMs={10}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "模拟编辑正文" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByText(/本机版本已安全保留/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新载入云端版本" }));
    await act(async () => Promise.resolve());

    expect(loadLatest).toHaveBeenCalledWith(id);
    expect(screen.getByRole("dialog", { name: "写给云端的信" })).toBeTruthy();
    expect(screen.getByTestId("editor-json").textContent).toContain('"cloud":true');
  });

  it("warns not to refresh or close when a conflicted local version is not recovered", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const saveDraft = vi.fn(async (): Promise<AutosaveSaveResult> => ({
      ok: false,
      code: "VERSION_CONFLICT",
      message: "版本冲突",
    }));
    render(
      <LetterComposer
        state={state}
        metadata={metadata}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={saveDraft}
        autosaveDelayMs={10}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "模拟编辑正文" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));

    expect(screen.getByText(/本机也未能保存，请勿刷新或关闭/)).toBeTruthy();
    expect(screen.queryByText(/本机版本已安全保留/)).toBeNull();
  });

  it("uses the latest server version to truly re-save the kept local draft", async () => {
    const saveDraft = vi
      .fn<(draft: AutosaveDraft) => Promise<AutosaveSaveResult>>()
      .mockResolvedValueOnce({ ok: false, code: "VERSION_CONFLICT", message: "版本冲突" })
      .mockImplementationOnce(async (draft) => ({
        ok: true,
        id: draft.id,
        version: draft.version + 1,
      }));
    const loadLatest = vi.fn(async () => ({ ok: true as const, letter: cloudLetter() }));
    render(
      <LetterComposer
        state={state}
        metadata={metadata}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={saveDraft}
        loadLatest={loadLatest}
        autosaveDelayMs={10}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "模拟编辑正文" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    fireEvent.click(screen.getByRole("button", { name: "继续保留本机版本" }));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft.mock.calls[1][0]).toMatchObject({
      id,
      version: 8,
      bodyText: "本机正文",
    });
    expect(screen.getByText("本机版本已按云端最新版本重新保存。")).toBeTruthy();
  });

  it("refuses to overwrite a letter that is no longer a draft", async () => {
    const saveDraft = vi.fn(async (): Promise<AutosaveSaveResult> => ({
      ok: false,
      code: "VERSION_CONFLICT",
      message: "版本冲突",
    }));
    const loadLatest = vi.fn(async () => ({
      ok: true as const,
      letter: cloudLetter({ status: "published" }),
    }));
    render(
      <LetterComposer
        state={state}
        metadata={metadata}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={saveDraft}
        loadLatest={loadLatest}
        autosaveDelayMs={10}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "模拟编辑正文" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    fireEvent.click(screen.getByRole("button", { name: "继续保留本机版本" }));
    await act(async () => Promise.resolve());

    expect(screen.getByRole("alert").textContent).toContain("已经不再是草稿");
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it("restores an old time capsule with its exact time and asks for reselection", () => {
    render(
      <LetterComposer
        state={{
          step: "compose",
          today: "2026-07-15",
          kind: "time_capsule",
          salutation: "未来的你",
          scheduledFor: "2020-08-01T08:30:00+08:00",
        }}
        metadata={{
          id,
          version: 4,
          letterDate: "2020-08-01",
          kind: "time_capsule",
          status: "draft",
          salutation: "未来的你",
          bodyJson: { type: "doc", content: [] },
          bodyText: "旧时光",
          finalLine: "",
          scheduledFor: "2020-08-01T08:30:00+08:00",
          sliders: null,
        }}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={vi.fn(async () => ({ ok: true as const, id, version: 5 }))}
        loadLatest={vi.fn(async () => ({ ok: true as const, letter: cloudLetter() }))}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("原定送达时间已经过去");
  });
});
