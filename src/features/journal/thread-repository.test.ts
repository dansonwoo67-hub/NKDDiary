import { describe, expect, it, vi } from "vitest";
import { getLetterThreadDetail, listLetterThreads } from "./thread-repository";

describe("letter thread repository", () => {
  it("maps viewer-safe thread summaries without deriving unread from opened_at", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      thread_id: "thread-1", counterpart_id: "user-2", latest_activity_at: "2026-09-01T01:00:00Z",
      latest_letter_id: "letter-2", latest_preview: "对方撤回了一封信", letter_count: 2,
      origin_type: "today", root_open_at: null, root_opened_at: null,
      latest_withdrawn: true, unread: false,
    }], error: null });

    await expect(listLetterThreads({ rpc } as never)).resolves.toEqual([expect.objectContaining({
      threadId: "thread-1", letterCount: 2, unread: false, latestWithdrawn: true,
    })]);
    expect(rpc).toHaveBeenCalledWith("list_letter_threads", expect.any(Object));
  });

  it("preserves server redaction in detail mapping", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      thread_id: "thread-1", letter_id: "letter-1", reply_to_id: null,
      author_id: "user-1", recipient_id: "user-2", entry_type: "today",
      published_at: "2026-09-01T01:00:00Z", open_at: null, opened_at: null,
      withdrawn_at: "2026-09-01T01:01:00Z", body_visible: false, title: null,
      rich_content: null, plain_text: null, excerpt: null, stationery_theme: null,
      mood_emoji: null, image_path: null, reply_allowed: false, resend_allowed: false,
      thread_count: 1,
    }], error: null });

    await expect(getLetterThreadDetail({ rpc } as never, "thread-1")).resolves.toEqual([
      expect.objectContaining({ letterId: "letter-1", bodyVisible: false, plainText: null }),
    ]);
  });
});
