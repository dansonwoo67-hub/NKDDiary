import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayDiaryEditor } from "./TodayDiaryEditor";

describe("TodayDiaryEditor", () => {
  afterEach(cleanup);

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
          imagePath: null,
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

  it("lets a future image control supply the submitted image path", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "今日日记已发布。" });

    render(
      <TodayDiaryEditor
        today="2026-07-19"
        action={action}
        renderImageControl={({ onImagePathChange }) => (
          <button type="button" onClick={() => onImagePathChange("space/author/entry.webp")}>
            选择图片
          </button>
        )}
      />,
    );

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "普通的一天" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "今天一起散步。" } });
    fireEvent.click(screen.getByRole("button", { name: "选择图片" }));
    fireEvent.click(screen.getByRole("button", { name: "发布今日日记" }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(expect.objectContaining({ imagePath: "space/author/entry.webp" })),
    );
  });
});
