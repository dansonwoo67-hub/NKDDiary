import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayDiaryEditor } from "./TodayDiaryEditor";

describe("TodayDiaryEditor", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("submits today’s entry date with the diary content", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "今日日记已发布。" });

    render(<TodayDiaryEditor today="2026-07-19" action={action} />);

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "普通的一天" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "今天一起散步。" } });
    fireEvent.click(screen.getByRole("button", { name: "发布今日日记" }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(
        expect.objectContaining({
          entryDate: "2026-07-19",
          title: "普通的一天",
          content: "今天一起散步。",
        }),
      ),
    );
  });

  it("shows a validation message instead of submitting blank content", async () => {
    const action = vi.fn();

    render(<TodayDiaryEditor today="2026-07-19" action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "发布今日日记" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请填写标题和正文。");
    expect(action).not.toHaveBeenCalled();
  });

  it("displays a server-side submission message", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: "今天已经写过一篇日记了。" });

    render(<TodayDiaryEditor today="2026-07-19" action={action} />);
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "普通的一天" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "今天一起散步。" } });
    fireEvent.click(screen.getByRole("button", { name: "发布今日日记" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("今天已经写过一篇日记了。");
  });

  it("submits text-only form data without an image path", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "今日日记已发布。" });

    render(<TodayDiaryEditor today="2026-07-19" action={action} initialValues={{ title: "普通的一天", content: "今天一起散步。" }} />);

    fireEvent.click(screen.getByRole("button", { name: "发布今日日记" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][0]).not.toHaveProperty("imagePath");
    expect(JSON.stringify(action.mock.calls[0][0])).not.toContain("space/author/entry.webp");
  });

  it("replaces an edit form with locked copy when the deadline passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:59:50Z"));

    render(
      <TodayDiaryEditor
        today="2026-07-19"
        action={vi.fn()}
        lockedAt="2026-07-20T10:00:00Z"
        initialValues={{ title: "普通的一天", content: "今天一起散步。" }}
        submitLabel="保存修改"
      />,
    );

    expect(screen.getByLabelText("标题")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存修改" })).toBeVisible();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("这篇日记已锁定")).toBeVisible();
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存修改" })).not.toBeInTheDocument();
  });

  it("renders locked copy immediately for an already-expired edit deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T10:00:00Z"));

    render(<TodayDiaryEditor today="2026-07-19" action={vi.fn()} lockedAt="2026-07-20T10:00:00Z" submitLabel="保存修改" />);

    expect(screen.getByText("这篇日记已锁定")).toBeVisible();
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存修改" })).not.toBeInTheDocument();
  });

  it("keeps a create form available without a lock deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T10:00:00Z"));

    render(<TodayDiaryEditor today="2026-07-20" action={vi.fn()} />);

    expect(screen.getByLabelText("标题")).toBeVisible();
    expect(screen.getByRole("button", { name: "发布今日日记" })).toBeVisible();
    expect(screen.queryByText("这篇日记已锁定")).not.toBeInTheDocument();
  });
});
