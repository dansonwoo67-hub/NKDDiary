import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/interactions/actions", () => ({
  createCommentAction: vi.fn().mockResolvedValue({ ok: true, message: "评论已发布。" }),
  updateCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
}));

import { createCommentAction } from "@/features/interactions/actions";
import { Comments } from "./Comments";

describe("Comments", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders one chronological level and submits plain text comments", async () => {
    render(
      <Comments
        entryId="11111111-1111-4111-8111-111111111111"
        comments={[
          { id: "1", body: "较早", authorId: "a", authorName: "小丹", createdAt: "2026-07-20T01:00:00Z", updatedAt: "2026-07-20T01:00:00Z", canManage: false },
          { id: "2", body: "较晚", authorId: "b", authorName: "对方", createdAt: "2026-07-20T02:00:00Z", updatedAt: "2026-07-20T02:00:00Z", canManage: false },
        ]}
      />,
    );

    expect(screen.getAllByTestId("journal-comment").map((node) => node.textContent)).toEqual([
      expect.stringContaining("较早"),
      expect.stringContaining("较晚"),
    ]);
    fireEvent.change(screen.getByLabelText("写评论"), { target: { value: "  一起加油 ❤️  " } });
    fireEvent.click(screen.getByRole("button", { name: "发布评论" }));

    expect(createCommentAction).toHaveBeenCalledWith({
      entryId: "11111111-1111-4111-8111-111111111111",
      body: "  一起加油 ❤️  ",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("评论已发布。");
  });
});
