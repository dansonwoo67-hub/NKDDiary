import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LetterMutationResult } from "@/features/letters/actions";
import { LetterComposer } from "./LetterComposer";
import type { AutosaveDraft, AutosaveSaveResult } from "./useDraftAutosave";

const refresh = vi.fn();
vi.mock("./RichLetterEditor", () => ({
  RichLetterEditor: () => <div>正文编辑器</div>,
}));
vi.mock("./ImageUploadButton", () => ({
  ImageUploadButton: () => <button type="button">上传图片</button>,
}));

const id = "11111111-1111-4111-8111-111111111111";
const okTransition = (): LetterMutationResult => ({ ok: true, message: "完成" });

function dailyState() {
  return {
    step: "compose" as const,
    today: "2026-07-15",
    kind: "daily" as const,
    salutation: "老婆",
    answers: { mood: 5, meal: 4, health: 3 },
  };
}

function capsuleState() {
  return {
    step: "compose" as const,
    today: "2026-07-15",
    kind: "time_capsule" as const,
    salutation: "未来的你",
    scheduledFor: "2099-08-01T08:30:00+08:00",
  };
}

const capsuleMetadata = {
  id,
  version: 3,
  letterDate: "2099-08-01",
  kind: "time_capsule" as const,
  status: "draft" as const,
  salutation: "未来的你",
  bodyJson: { type: "doc", content: [] },
  bodyText: "写给未来的正文",
  finalLine: "未来见",
  scheduledFor: "2099-08-01T08:30:00+08:00",
  sliders: null,
};

describe("LetterComposer publish flow", () => {
  beforeEach(() => {
    localStorage.clear();
    refresh.mockClear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("autosaves the final line and publishes a newly created draft with the post-flush id and version", async () => {
    const order: string[] = [];
    const saveDraft = vi.fn(async (draft: AutosaveDraft): Promise<AutosaveSaveResult> => {
      order.push("save");
      return { ok: true, id, version: draft.version + 1 };
    });
    const publishDaily = vi.fn(async (input: { id: string; version: number }) => {
      order.push("publish");
      expect(input).toEqual({ id, version: 1 });
      return okTransition();
    });
    const onClose = vi.fn();
    render(
      <LetterComposer
        state={dailyState()}
        metadata={null}
        recoveryOwnerId="user-a"
        onClose={onClose}
        saveDraft={saveDraft}
        publishDaily={publishDaily}
        scheduleLetter={vi.fn()}
        onTransitionSuccess={refresh}
        autosaveDelayMs={10_000}
      />,
    );

    fireEvent.change(screen.getByLabelText("总而言之，我想跟你说"), {
      target: { value: "等你回家" },
    });
    fireEvent.click(screen.getByRole("button", { name: "寄出" }));
    expect(screen.getByText("寄出后不能修改，24小时内可以撤回。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认寄出" }));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(saveDraft.mock.calls[0][0].finalLine).toBe("等你回家");
    expect(order).toEqual(["save", "publish"]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never publishes when the flush is offline and keeps the field editable", async () => {
    const publishDaily = vi.fn();
    render(
      <LetterComposer
        state={dailyState()}
        metadata={null}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={vi.fn(async (): Promise<AutosaveSaveResult> => ({
          ok: false,
          code: "NETWORK_ERROR",
          message: "网络断开",
        }))}
        publishDaily={publishDaily}
        scheduleLetter={vi.fn()}
        autosaveDelayMs={10_000}
      />,
    );
    fireEvent.change(screen.getByLabelText("总而言之，我想跟你说"), { target: { value: "晚安" } });
    fireEvent.click(screen.getByRole("button", { name: "寄出" }));
    fireEvent.click(screen.getByRole("button", { name: "确认寄出" }));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(publishDaily).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("网络断开");
    expect(screen.getByLabelText("总而言之，我想跟你说")).toHaveProperty("disabled", false);
  });

  it("schedules with the authoritative id, version and selected future time", async () => {
    const saveDraft = vi.fn(async (draft: AutosaveDraft): Promise<AutosaveSaveResult> => ({
      ok: true,
      id: draft.id,
      version: draft.version + 1,
    }));
    const scheduleLetter = vi.fn(async () => okTransition());
    render(
      <LetterComposer
        state={capsuleState()}
        metadata={capsuleMetadata}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={saveDraft}
        publishDaily={vi.fn()}
        scheduleLetter={scheduleLetter}
        onTransitionSuccess={refresh}
        autosaveDelayMs={10_000}
      />,
    );
    fireEvent.change(screen.getByLabelText("总而言之，我想跟你说"), { target: { value: "未来见呀" } });
    fireEvent.click(screen.getByRole("button", { name: "放进时间胶囊" }));
    fireEvent.click(screen.getByRole("button", { name: "确认放进时间胶囊" }));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(scheduleLetter).toHaveBeenCalledWith(
      expect.objectContaining({ id, version: 4, scheduledFor: "2099-08-01T08:30:00+08:00" }),
    );
  });

  it("submits only once on rapid confirmation and remains editable after a server error", async () => {
    let resolve!: (result: LetterMutationResult) => void;
    const publishDaily = vi.fn(
      () => new Promise<LetterMutationResult>((done) => { resolve = done; }),
    );
    render(
      <LetterComposer
        state={dailyState()}
        metadata={{ ...capsuleMetadata, kind: "daily", letterDate: "2026-07-15", scheduledFor: null, sliders: { mood: 5, meal: 4, health: 3 }, finalLine: "晚安" }}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={vi.fn(async (draft: AutosaveDraft) => ({ ok: true as const, id: draft.id, version: draft.version + 1 }))}
        publishDaily={publishDaily}
        scheduleLetter={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("总而言之，我想跟你说"), { target: { value: "想你" } });
    fireEvent.click(screen.getByRole("button", { name: "寄出" }));
    const confirm = screen.getByRole("button", { name: "确认寄出" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(publishDaily).toHaveBeenCalledTimes(1));

    await act(async () => resolve({ ok: false, code: "DATABASE_ERROR", message: "暂时寄不出去" }));
    expect(screen.getByRole("alert").textContent).toContain("暂时寄不出去");
    expect(screen.getByLabelText("总而言之，我想跟你说")).toHaveProperty("disabled", false);
  });

  it("publishes an unchanged server draft whose flush has nothing left to save", async () => {
    const publishDaily = vi.fn(async () => okTransition());
    render(
      <LetterComposer
        state={dailyState()}
        metadata={{ ...capsuleMetadata, kind: "daily", letterDate: "2026-07-15", scheduledFor: null, sliders: { mood: 5, meal: 4, health: 3 }, finalLine: "晚安" }}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={vi.fn(async (draft: AutosaveDraft) => ({ ok: true as const, id: draft.id, version: draft.version }))}
        publishDaily={publishDaily}
        scheduleLetter={vi.fn()}
        onTransitionSuccess={refresh}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "寄出" }));
    fireEvent.click(screen.getByRole("button", { name: "确认寄出" }));
    await waitFor(() => expect(publishDaily).toHaveBeenCalledWith({ id, version: 3 }));
  });

  it("does not open confirmation until the final line is valid", () => {
    render(
      <LetterComposer
        state={dailyState()}
        metadata={null}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={vi.fn(async () => ({ ok: true as const, id, version: 1 }))}
        publishDaily={vi.fn()}
        scheduleLetter={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "寄出" }));
    expect(screen.getByRole("alert").textContent).toContain("请写下最后想说的话");
    expect(screen.queryByRole("dialog", { name: "确认寄出这封信" })).toBeNull();
  });

  it("never calls a transition for an injected over-seven final line", () => {
    const publishDaily = vi.fn();
    render(
      <LetterComposer
        state={dailyState()}
        metadata={{ ...capsuleMetadata, kind: "daily", letterDate: "2026-07-15", scheduledFor: null, sliders: { mood: 5, meal: 4, health: 3 }, finalLine: "一二三四五六七八" }}
        recoveryOwnerId="user-a"
        onClose={vi.fn()}
        saveDraft={vi.fn(async () => ({ ok: true as const, id, version: 4 }))}
        publishDaily={publishDaily}
        scheduleLetter={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "寄出" }));
    expect(screen.getByRole("alert").textContent).toContain("最多写7个字");
    expect(publishDaily).not.toHaveBeenCalled();
  });
});
