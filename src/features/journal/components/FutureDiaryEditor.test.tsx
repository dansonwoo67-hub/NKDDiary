import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/media/actions", () => ({ uploadJournalImageAction: vi.fn() }));
vi.mock("@/features/media/compress-image", () => ({ compressJournalImage: vi.fn() }));

import { uploadJournalImageAction } from "@/features/media/actions";
import { compressJournalImage } from "@/features/media/compress-image";
import { FutureDiaryEditor, shanghaiWallTimeToIso } from "./FutureDiaryEditor";

const recipientId = "33333333-3333-4333-8333-333333333333";
const mockUpload = vi.mocked(uploadJournalImageAction);
const mockCompress = vi.mocked(compressJournalImage);

describe("FutureDiaryEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-23T04:00:00Z"));
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:future-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("treats datetime-local as a Shanghai wall time without browser timezone ambiguity", () => {
    expect(shanghaiWallTimeToIso("2026-08-01T20:30")).toBe("2026-08-01T12:30:00.000Z");
    expect(shanghaiWallTimeToIso("2026-02-30T20:30")).toBeNull();
    expect(shanghaiWallTimeToIso("not-a-date")).toBeNull();
  });

  it("shows the irreversible warning and submits only after explicit confirmation", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "未来日记已封存。" });
    render(<FutureDiaryEditor recipientId={recipientId} recipientName="小楠" action={action} />);

    expect(screen.getByText("封存后不能修改、撤回或删除。你仍可在“我写出的”中回看。")).toBeVisible();
    expect(screen.getByRole("button", { name: "确认封存" })).toBeVisible();

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "写给以后" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "到那天再读。" } });
    fireEvent.change(screen.getByLabelText("开启时间"), { target: { value: "2026-08-01T20:30" } });
    fireEvent.click(screen.getByRole("button", { name: "确认封存" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith({
      title: "写给以后",
      content: "到那天再读。",
      recipientId,
      openAt: "2026-08-01T12:30:00.000Z",
    }));
  });

  it("rejects an invalid or non-future Shanghai time before calling the server", () => {
    const action = vi.fn();
    render(<FutureDiaryEditor recipientId={recipientId} recipientName="小楠" action={action} />);
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "写给以后" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "到那天再读。" } });
    fireEvent.change(screen.getByLabelText("开启时间"), { target: { value: "2026-07-23T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "确认封存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请选择一个晚于现在的有效开启时间。");
    expect(action).not.toHaveBeenCalled();
  });

  it("sends an optional compressed Blob through the server-owned future upload flow", async () => {
    const compressed = new Blob([new Uint8Array(400)], { type: "image/webp" });
    mockCompress.mockResolvedValue(compressed);
    mockUpload.mockResolvedValue({ ok: true, message: "未来日记已封存。", entryId: "entry-1" });
    const action = vi.fn();
    render(<FutureDiaryEditor recipientId={recipientId} recipientName="小楠" action={action} />);

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "写给以后" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "到那天再读。" } });
    fireEvent.change(screen.getByLabelText("开启时间"), { target: { value: "2026-08-01T20:30" } });
    fireEvent.change(screen.getByLabelText("添加一张图片"), {
      target: { files: [new File([new Uint8Array(1_024)], "photo.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByAltText("所选日记图片预览");
    fireEvent.click(screen.getByRole("button", { name: "确认封存" }));

    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    expect(mockUpload.mock.calls[0][0]).toEqual({
      kind: "seal-future",
      title: "写给以后",
      content: "到那天再读。",
      recipientId,
      openAt: "2026-08-01T12:30:00.000Z",
    });
    expect((mockUpload.mock.calls[0][1] as FormData).get("image")).toBeInstanceOf(Blob);
    expect(mockUpload.mock.calls[0][0]).not.toHaveProperty("imagePath");
    expect(action).not.toHaveBeenCalled();
  });
});
