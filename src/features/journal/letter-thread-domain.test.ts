import { describe, expect, it } from "vitest";
import { buildLetterThreads, classifyLetter, mapLetterRow } from "./letter-thread-domain";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "letter-1",
  author_id: "user-a",
  recipient_id: "user-b",
  entry_type: "today",
  created_at: "2026-08-29T01:00:00Z",
  published_at: "2026-08-29T01:00:00Z",
  opened_at: null,
  withdrawn_at: null,
  thread_id: null,
  reply_to_id: null,
  ...overrides,
});

describe("letter thread domain", () => {
  it("classifies explicit product letter types and excludes legacy records", () => {
    expect(classifyLetter(row())).toBe("ordinary");
    expect(classifyLetter(row({ entry_type: "future" }))).toBe("capsule");
    expect(classifyLetter(row({ recipient_id: null }))).toBe("legacy");
  });

  it("uses a standalone historical letter as its own thread", () => {
    const threads = buildLetterThreads([row()], "user-b");
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      threadId: "letter-1",
      firstLetterId: "letter-1",
      latestLetterId: "letter-1",
      totalCount: 1,
      unread: true,
      originType: "ordinary",
    });
  });

  it("groups only letters with the same explicit thread id", () => {
    const threads = buildLetterThreads([
      row({ id: "letter-1", thread_id: "thread-1" }),
      row({ id: "letter-2", author_id: "user-b", recipient_id: "user-a", thread_id: "thread-1", reply_to_id: "letter-1", created_at: "2026-08-29T02:00:00Z", published_at: "2026-08-29T02:00:00Z", opened_at: "2026-08-29T02:01:00Z" }),
    ], "user-a");
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      threadId: "thread-1",
      participants: ["user-a", "user-b"],
      firstLetterId: "letter-1",
      latestLetterId: "letter-2",
      totalCount: 2,
      unread: false,
    });
    expect(threads[0].letters[1].replyToId).toBe("letter-1");
  });

  it("preserves capsule origin when later replies are ordinary", () => {
    const [thread] = buildLetterThreads([
      row({ id: "capsule-1", entry_type: "future", thread_id: "thread-c", created_at: "2026-01-01T00:00:00Z" }),
      row({ id: "reply-1", thread_id: "thread-c", reply_to_id: "capsule-1", created_at: "2026-08-29T00:00:00Z" }),
    ], "user-b");
    expect(thread.originType).toBe("capsule");
  });

  it("keeps withdrawn letters in thread history without marking them unread", () => {
    const letter = mapLetterRow(row({ withdrawn_at: "2026-08-29T01:30:00Z" }), "user-b");
    expect(letter).toMatchObject({ kind: "ordinary", state: "withdrawn", unread: false });
  });

  it("excludes legacy today records from threads", () => {
    expect(buildLetterThreads([row({ recipient_id: null })], "user-a")).toEqual([]);
  });
});
