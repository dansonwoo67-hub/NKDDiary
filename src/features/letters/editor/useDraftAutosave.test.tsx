import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  draftRecoveryKey,
  readDraftRecovery,
  useDraftAutosave,
  type AutosaveDraft,
  type AutosaveSaveResult,
} from "./useDraftAutosave";

const emptyDocument = { type: "doc", content: [] };

function draft(overrides: Partial<AutosaveDraft> = {}): AutosaveDraft {
  return {
    version: 0,
    kind: "daily",
    letterDate: "2026-07-15",
    salutation: "亲爱的",
    bodyJson: emptyDocument,
    bodyText: "",
    finalLine: "",
    sliders: {
      selfMoodValue: 3,
      mealValue: 3,
      healthValue: 3,
    },
    ...overrides,
  };
}

function saved(
  input: AutosaveDraft,
  overrides: Partial<Extract<AutosaveSaveResult, { ok: true }>> = {},
): AutosaveSaveResult {
  return {
    ok: true,
    id: input.id ?? "0f91b468-a6b7-46a0-a1ae-477be060fd4c",
    version: input.version + 1,
    ...overrides,
  };
}

describe("useDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("debounces changes and saves only after the quiet period", async () => {
    const save = vi.fn(async (input: AutosaveDraft) => saved(input));
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save,
        delayMs: 1_000,
      }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "new" }));
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(save).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].bodyText).toBe("new");
    expect(result.current.state).toBe("saved");
  });

  it("coalesces edits during an in-flight save and advances the server version", async () => {
    let resolveFirst!: (value: AutosaveSaveResult) => void;
    const save = vi
      .fn<(input: AutosaveDraft) => Promise<AutosaveSaveResult>>()
      .mockImplementationOnce(
        (input) =>
          new Promise((resolve) => {
            resolveFirst = (value) => resolve(value);
            expect(input.version).toBe(0);
          }),
      )
      .mockImplementationOnce(async (input) => {
        expect(input.bodyText).toBe("second");
        expect(input.id).toBe("0f91b468-a6b7-46a0-a1ae-477be060fd4c");
        expect(input.version).toBe(1);
        return saved(input);
      });

    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save,
        delayMs: 10,
      }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "first" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    act(() => result.current.update({ ...result.current.draft, bodyText: "second" }));
    await act(async () => {
      resolveFirst({
        ok: true,
        id: "0f91b468-a6b7-46a0-a1ae-477be060fd4c",
        version: 1,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.draft.version).toBe(2);
    expect(result.current.state).toBe("saved");
  });

  it("migrates a new-draft recovery key after the server assigns an id", async () => {
    const save = vi.fn(async (input: AutosaveDraft) => saved(input));
    const identity = "user-a:daily:2026-07-15";
    const { result } = renderHook(() =>
      useDraftAutosave({ initialDraft: draft(), recoveryIdentity: identity, save, delayMs: 10 }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "hello" }));
    const oldKey = draftRecoveryKey(identity);
    expect(localStorage.getItem(oldKey)).not.toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(localStorage.getItem(oldKey)).toBeNull();
    expect(result.current.draft.id).toBe("0f91b468-a6b7-46a0-a1ae-477be060fd4c");
  });

  it("stops automatic retries on a version conflict", async () => {
    const save = vi.fn(async (): Promise<AutosaveSaveResult> => ({
      ok: false,
      code: "VERSION_CONFLICT",
      message: "conflict",
    }));
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft({ id: "0f91b468-a6b7-46a0-a1ae-477be060fd4c", version: 2 }),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save,
        delayMs: 10,
      }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "mine" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("conflict");
    expect(result.current.conflict).toEqual({ message: "conflict" });
  });

  it("keeps an offline recovery copy without retrying forever", async () => {
    const save = vi.fn(async (): Promise<AutosaveSaveResult> => ({
      ok: false,
      code: "DATABASE_ERROR",
      message: "offline",
    }));
    const identity = "user-a:daily:2026-07-15";
    const { result } = renderHook(() =>
      useDraftAutosave({ initialDraft: draft(), recoveryIdentity: identity, save, delayMs: 10 }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "kept locally" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("offline");
    expect(readDraftRecovery(identity)?.bodyText).toBe("kept locally");
  });

  it("does not clear a newer local edit when an older save resolves", async () => {
    let resolveSave!: (value: AutosaveSaveResult) => void;
    const save = vi.fn(
      (input: AutosaveDraft) =>
        new Promise<AutosaveSaveResult>((resolve) => {
          resolveSave = resolve;
          expect(input.bodyText).toBe("first");
        }),
    );
    const identity = "user-a:daily:2026-07-15";
    const { result } = renderHook(() =>
      useDraftAutosave({ initialDraft: draft(), recoveryIdentity: identity, save, delayMs: 10 }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "first" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    act(() => result.current.update({ ...result.current.draft, bodyText: "newer" }));
    await act(async () => {
      resolveSave(saved(draft({ bodyText: "first" })));
      await Promise.resolve();
    });

    expect(readDraftRecovery(identity, "0f91b468-a6b7-46a0-a1ae-477be060fd4c")?.bodyText).toBe(
      "newer",
    );
  });

  it("flushes the latest pending change immediately", async () => {
    const save = vi.fn(async (input: AutosaveDraft) => saved(input));
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save,
        delayMs: 10_000,
      }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "flush me" }));
    await act(async () => {
      expect(await result.current.flush()).toMatchObject({
        state: "saved",
        draft: {
          id: "0f91b468-a6b7-46a0-a1ae-477be060fd4c",
          version: 1,
          bodyText: "flush me",
        },
      });
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].bodyText).toBe("flush me");
  });

  it("blocks unload when a dirty draft cannot be written to local recovery", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save: vi.fn(async (input: AutosaveDraft) => saved(input)),
        delayMs: 10_000,
      }),
    );
    act(() => result.current.update({ ...result.current.draft, bodyText: "unsafe on unload" }));

    const event = new Event("beforeunload", { cancelable: true });
    act(() => window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe(false);
  });

  it("does not block unload when a dirty draft is safely recovered locally", async () => {
    const identity = "user-a:daily:2026-07-15";
    const save = vi.fn(async (input: AutosaveDraft) => saved(input));
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: identity,
        save,
        delayMs: 10_000,
      }),
    );
    act(() => result.current.update({ ...result.current.draft, bodyText: "safe on unload" }));

    const event = new Event("beforeunload", { cancelable: true });
    act(() => window.dispatchEvent(event));
    expect(readDraftRecovery(identity)?.bodyText).toBe("safe on unload");
    expect(event.defaultPrevented).toBe(false);
    await act(async () => Promise.resolve());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not block unload when the draft has no unsaved revision", () => {
    renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save: vi.fn(async (input: AutosaveDraft) => saved(input)),
        delayMs: 10_000,
      }),
    );

    const event = new Event("beforeunload", { cancelable: true });
    act(() => window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(false);
  });

  it("restores only bounded, matching recovery data and strips data-image sources", () => {
    const identity = "user-a:daily:2026-07-15";
    localStorage.setItem(
      draftRecoveryKey(identity),
      JSON.stringify({
        schema: 1,
        identity,
        revision: 2,
        draft: draft({
          bodyText: "restored",
          bodyJson: {
            type: "doc",
            content: [{ type: "image", attrs: { src: "data:image/png;base64,AAAA" } }],
          },
        }),
      }),
    );

    const recovered = readDraftRecovery(identity);
    expect(recovered?.bodyText).toBe("restored");
    expect(JSON.stringify(recovered?.bodyJson)).not.toContain("data:image");
    expect(readDraftRecovery("user-b:daily:2026-07-15")).toBeNull();
  });

  it("queues an untouched recovered draft for a server save", async () => {
    const identity = "user-a:daily:2026-07-15";
    localStorage.setItem(
      draftRecoveryKey(identity),
      JSON.stringify({
        schema: 1,
        identity,
        revision: 3,
        draft: draft({ bodyText: "recovered and untouched" }),
      }),
    );
    const save = vi.fn(async (input: AutosaveDraft) => saved(input));
    const { result } = renderHook(() =>
      useDraftAutosave({ initialDraft: draft(), recoveryIdentity: identity, save, delayMs: 10 }),
    );

    expect(result.current.draft.bodyText).toBe("recovered and untouched");
    expect(result.current.state).toBe("offline");
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("saved");
  });

  it("can create a new server draft even before the writer changes the body", async () => {
    const identity = "user-a:daily:2026-07-15";
    const save = vi.fn(async (input: AutosaveDraft) => saved(input));
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: identity,
        save,
        saveInitial: true,
        delayMs: 10,
      }),
    );

    expect(readDraftRecovery(identity)?.bodyText).toBe("");
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.draft.id).toBe("0f91b468-a6b7-46a0-a1ae-477be060fd4c");
    expect(result.current.state).toBe("saved");
  });

  it("can keep the local conflict copy after receiving a fresh server version", async () => {
    const save = vi
      .fn<(input: AutosaveDraft) => Promise<AutosaveSaveResult>>()
      .mockResolvedValueOnce({ ok: false, code: "VERSION_CONFLICT", message: "conflict" })
      .mockImplementationOnce(async (input) => {
        expect(input.version).toBe(8);
        expect(input.bodyText).toBe("keep mine");
        return saved(input);
      });
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft({ id: "0f91b468-a6b7-46a0-a1ae-477be060fd4c", version: 7 }),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save,
        delayMs: 10,
      }),
    );
    act(() => result.current.update({ ...result.current.draft, bodyText: "keep mine" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(result.current.state).toBe("conflict");

    act(() => result.current.resolveConflict({ strategy: "keep-local", serverVersion: 8 }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("saved");
  });

  it("ignores oversized and wrong-shape recovery payloads", () => {
    const identity = "user-a:daily:2026-07-15";
    localStorage.setItem(draftRecoveryKey(identity), "x".repeat(750_001));
    expect(readDraftRecovery(identity)).toBeNull();
    localStorage.setItem(
      draftRecoveryKey(identity),
      JSON.stringify({ schema: 1, identity, revision: 1, draft: { __proto__: { admin: true } } }),
    );
    expect(readDraftRecovery(identity)).toBeNull();
  });

  it("uses the shared seven-character rule for recovered salutations and final lines", () => {
    const identity = "user-a:daily:2026-07-15";
    const store = (salutation: string, finalLine: string) =>
      localStorage.setItem(
        draftRecoveryKey(identity),
        JSON.stringify({
          schema: 1,
          identity,
          revision: 1,
          draft: draft({ salutation, finalLine }),
        }),
      );

    store("😀😀😀😀😀😀😀", "😀😀😀😀😀😀😀");
    expect(readDraftRecovery(identity)).not.toBeNull();
    store("😀😀😀😀😀😀😀😀", "");
    expect(readDraftRecovery(identity)).toBeNull();
  });

  it("reports that local recovery is unsafe when storage rejects writes", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota", "QuotaExceededError");
      });
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save: vi.fn(async (input: AutosaveDraft) => saved(input)),
        delayMs: 10,
      }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "not locally safe" }));
    expect(result.current.recoverySafe).toBe(false);
    setItem.mockRestore();
  });

  it("distinguishes server validation from network failure and reports unsafe oversized recovery", async () => {
    const save = vi.fn(async (): Promise<AutosaveSaveResult> => ({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "正文格式不正确",
    }));
    const { result } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save,
        delayMs: 10,
      }),
    );
    act(() =>
      result.current.update({
        ...result.current.draft,
        bodyJson: { type: "doc", padding: "x".repeat(760_000) },
        bodyText: "valid length",
      }),
    );
    expect(result.current.recoverySafe).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(result.current.failure).toEqual({
      kind: "validation",
      message: "正文格式不正确",
    });
    expect(result.current.recoverySafe).toBe(false);
  });

  it("does not update React state after unmount while a save finishes", async () => {
    let resolveSave!: (value: AutosaveSaveResult) => void;
    const save = vi.fn(
      () =>
        new Promise<AutosaveSaveResult>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() =>
      useDraftAutosave({
        initialDraft: draft(),
        recoveryIdentity: "user-a:daily:2026-07-15",
        save,
        delayMs: 10,
      }),
    );

    act(() => result.current.update({ ...result.current.draft, bodyText: "pending" }));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    unmount();
    await act(async () => resolveSave(saved(draft({ bodyText: "pending" }))));

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
