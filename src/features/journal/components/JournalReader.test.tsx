import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalReader } from "./JournalReader";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const entry = {
  id: "entry-1",
  authorId: "author-1",
  entryType: "today" as const,
  title: "普通的一天",
  content: "今天一起散步。",
  entryDate: "2026-07-19",
  publishedAt: "2026-07-19T10:00:00.000Z",
  updatedAt: "2026-07-19T11:00:00.000Z",
  lockedAt: "2099-07-20T10:00:00.000Z",
};

describe("JournalReader", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows today diary metadata and editable controls for an eligible author", () => {
    render(
      <JournalReader
        entry={entry}
        authorName="小丹"
        canManageTodayDiary
        todayDiaryState="editable"
        editHref="/journal/entry-1/edit"
        deleteAction={vi.fn().mockResolvedValue({ ok: true, message: "日记已删除。" })}
      />,
    );

    expect(screen.getByText("作者：小丹")).toBeVisible();
    expect(screen.getByText("2026-07-19")).toBeVisible();
    expect(screen.getByText("普通的一天")).toBeVisible();
    expect(screen.getByRole("link", { name: "编辑日记" })).toHaveAttribute("href", "/journal/entry-1/edit");
    expect(screen.getByRole("button", { name: "删除日记" })).toBeEnabled();
  });

  it("labels a non-author diary as author-only without exposing edit or delete controls", () => {
    render(<JournalReader entry={entry} authorName="小丹" canManageTodayDiary={false} todayDiaryState="author-only" />);

    expect(screen.getByText("仅作者可编辑")).toBeVisible();
    expect(screen.queryByRole("link", { name: "编辑日记" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除日记" })).not.toBeInTheDocument();
  });

  it("reports the result of a permitted delete action", async () => {
    const deleteAction = vi.fn().mockResolvedValue({ ok: true, message: "日记已删除。" });

    render(
      <JournalReader entry={entry} authorName="小丹" canManageTodayDiary todayDiaryState="editable" deleteAction={deleteAction} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "删除日记" }));

    expect(deleteAction).toHaveBeenCalledWith("entry-1");
    expect(await screen.findByRole("status")).toHaveTextContent("日记已删除。");
    expect(router.replace).toHaveBeenCalledWith("/journal");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("does not navigate after a failed delete action", async () => {
    const deleteAction = vi.fn().mockResolvedValue({ ok: false, message: "操作失败。" });

    render(
      <JournalReader entry={entry} authorName="小丹" canManageTodayDiary todayDiaryState="editable" deleteAction={deleteAction} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "删除日记" }));

    expect(await screen.findByRole("status")).toHaveTextContent("操作失败。");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("removes management controls when the lock deadline passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:59:50Z"));

    render(
      <JournalReader
        entry={{ ...entry, lockedAt: "2026-07-20T10:00:00Z" }}
        authorName="小丹"
        canManageTodayDiary
        todayDiaryState="editable"
        editHref="/journal/entry-1/edit"
        deleteAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "编辑日记" })).toBeVisible();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("link", { name: "编辑日记" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除日记" })).not.toBeInTheDocument();
  });

  it("does not render management controls for an already-expired deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T10:00:00Z"));

    render(
      <JournalReader
        entry={{ ...entry, lockedAt: "2026-07-20T10:00:00Z" }}
        authorName="小丹"
        canManageTodayDiary
        todayDiaryState="editable"
        editHref="/journal/entry-1/edit"
        deleteAction={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link", { name: "编辑日记" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除日记" })).not.toBeInTheDocument();
  });

  it("renders comments and body-only annotations when interactions are enabled", () => {
    render(
      <JournalReader
        entry={entry}
        authorName="小丹"
        canManageTodayDiary={false}
        todayDiaryState="author-only"
        interactions={{
          comments: [{ id: "comment-1", body: "写得真好", authorId: "b", authorName: "对方", createdAt: "2026-07-20T01:00:00Z", updatedAt: "2026-07-20T01:00:00Z", canManage: false }],
          annotations: [],
        }}
      />,
    );

    expect(screen.getByText("写得真好")).toBeVisible();
    expect(document.querySelector('[data-block-id="body"]')).toHaveTextContent(entry.content);
  });
});
