import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/journal/actions", () => ({ openFutureDiaryAction: vi.fn() }));

import { openFutureDiaryAction } from "@/features/journal/actions";
import { FutureDiaryCard } from "./FutureDiaryCard";

const mockOpen = vi.mocked(openFutureDiaryAction);

describe("FutureDiaryCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-01T11:59:58Z"));
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows only safe sender metadata while a received diary is sealed", () => {
    render(<FutureDiaryCard role="recipient" entry={{
      id: "55555555-5555-4555-8555-555555555555",
      authorName: "小丹",
      state: "waiting",
      sealedAt: "2026-07-23T04:00:00Z",
      openAt: "2026-08-01T12:00:00Z",
      openedAt: null,
    }} />);

    expect(screen.getByText("小丹留给你一颗时间胶囊")).toBeVisible();
    expect(screen.getByText(/距离可开启/)).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/标题|正文|秘密内容/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "开启胶囊" })).not.toBeInTheDocument();
  });

  it("announces only the meaningful ready transition instead of every tick", () => {
    render(<FutureDiaryCard role="recipient" entry={{
      id: "55555555-5555-4555-8555-555555555555",
      authorName: "小丹",
      state: "waiting",
      sealedAt: "2026-07-23T04:00:00Z",
      openAt: "2026-08-01T12:00:00Z",
      openedAt: null,
    }} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole("status")).toHaveTextContent("已到开启时间，可以开启时间胶囊。");
    expect(screen.getByText("已到开启时间，请确认开启。")).toHaveAttribute("aria-hidden", "true");
  });

  it("counting down only enables opening and relies on the server result", async () => {
    mockOpen.mockResolvedValue({ ok: false, message: "操作失败，请稍后再试。" });
    render(<FutureDiaryCard role="recipient" entry={{
      id: "55555555-5555-4555-8555-555555555555",
      authorName: "小丹",
      state: "waiting",
      sealedAt: "2026-07-23T04:00:00Z",
      openAt: "2026-08-01T12:00:00Z",
      openedAt: null,
    }} />);

    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.click(screen.getByRole("button", { name: "开启胶囊" }));
    await waitFor(() => expect(mockOpen).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555"));
    expect(screen.getByRole("alert")).toHaveTextContent("操作失败，请稍后再试。");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText("秘密内容")).not.toBeInTheDocument();
  });

  it("cleans up the countdown interval when the card leaves the page", () => {
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { unmount } = render(<FutureDiaryCard role="recipient" entry={{
      id: "55555555-5555-4555-8555-555555555555",
      authorName: "小丹",
      state: "waiting",
      sealedAt: "2026-07-23T04:00:00Z",
      openAt: "2026-08-01T12:00:00Z",
      openedAt: null,
    }} />);

    unmount();
    expect(clearInterval).toHaveBeenCalled();
  });

  it("asks for confirmation and refreshes after the server opens the diary", async () => {
    mockOpen.mockResolvedValue({ ok: true, message: "未来日记已开启。", entryId: "55555555-5555-4555-8555-555555555555" });
    render(<FutureDiaryCard role="recipient" entry={{
      id: "55555555-5555-4555-8555-555555555555",
      authorName: "小丹",
      state: "ready",
      sealedAt: "2026-07-23T04:00:00Z",
      openAt: "2026-08-01T12:00:00Z",
      openedAt: null,
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "开启胶囊" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalled();
  });

  it("recovers from a rejected open action without leaking or refreshing", async () => {
    mockOpen.mockRejectedValue(new Error("protected content exists: 秘密"));
    render(<FutureDiaryCard role="recipient" entry={{
      id: "55555555-5555-4555-8555-555555555555",
      authorName: "小丹",
      state: "ready",
      sealedAt: "2026-07-23T04:00:00Z",
      openAt: "2026-08-01T12:00:00Z",
      openedAt: null,
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "开启胶囊" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请稍后再试。");
    await waitFor(() => expect(screen.getByRole("button", { name: "开启胶囊" })).toBeEnabled());
    expect(refresh).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("protected content");
    expect(document.body).not.toHaveTextContent("秘密");
  });

  it("lets the author reread full content without widening received metadata", () => {
    render(<FutureDiaryCard role="author" entry={{
      id: "55555555-5555-4555-8555-555555555555",
      recipientName: "小楠",
      state: "waiting",
      sealedAt: "2026-07-23T04:00:00Z",
      openAt: "2026-08-01T12:00:00Z",
      openedAt: null,
      title: "写给以后",
      excerpt: "这段正文只有作者可以提前回看。",
    }} />);

    expect(screen.getByRole("heading", { name: "写给以后" })).toBeVisible();
    expect(screen.getByText("这段正文只有作者可以提前回看。")).toBeVisible();
    expect(screen.getByRole("link", { name: "回看日记" })).toHaveAttribute("href", "/journal/55555555-5555-4555-8555-555555555555");
  });
});
