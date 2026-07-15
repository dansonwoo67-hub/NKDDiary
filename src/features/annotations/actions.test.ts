import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createServerSupabaseClient: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createAnnotationReplyAction } from "./actions";

function clientWithLetterStatus(status: string) {
  const annotationQuery = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
  annotationQuery.select.mockReturnValue(annotationQuery);
  annotationQuery.eq.mockReturnValue(annotationQuery);
  annotationQuery.single.mockResolvedValue({
    data: {
      id: "44444444-4444-4444-8444-444444444444", author_id: "partner", letter_id: "letter-1",
      letters: { letter_date: "2026-07-15", author_id: "partner", status },
    },
    error: null,
  });
  const replies = { insert: vi.fn().mockResolvedValue({ error: null }) };
  const notifications = { insert: vi.fn().mockResolvedValue({ error: null }) };
  const from = vi.fn((table: string) => {
    if (table === "annotations") return annotationQuery;
    if (table === "annotation_replies") return replies;
    return notifications;
  });
  return { client: { from }, replies, notifications };
}

describe("annotation reply action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "viewer", profile: { display_name: "Dang" } });
  });

  it("rejects replies when the parent letter is no longer published", async () => {
    const fixture = clientWithLetterStatus("withdrawn");
    mocks.createServerSupabaseClient.mockResolvedValue(fixture.client);
    const result = await createAnnotationReplyAction({ annotationId: "44444444-4444-4444-8444-444444444444", body: "收到" });
    expect(result).toMatchObject({ ok: false });
    expect(fixture.replies.insert).not.toHaveBeenCalled();
  });

  it("authenticates, inserts once, and refreshes a published thread", async () => {
    const fixture = clientWithLetterStatus("published");
    mocks.createServerSupabaseClient.mockResolvedValue(fixture.client);
    const result = await createAnnotationReplyAction({ annotationId: "44444444-4444-4444-8444-444444444444", body: "  收到  " });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(fixture.replies.insert).toHaveBeenCalledWith({
      annotation_id: "44444444-4444-4444-8444-444444444444", author_id: "viewer", body: "收到",
    });
    expect(result).toMatchObject({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/letters/2026-07-15");
  });

  it.each([
    null,
    {},
    { annotationId: "not-a-uuid", body: "hello" },
    { annotationId: "44444444-4444-4444-8444-444444444444", body: 42 },
    { annotationId: "44444444-4444-4444-8444-444444444444", body: "   " },
    { annotationId: "44444444-4444-4444-8444-444444444444", body: "x".repeat(2001) },
  ])("rejects malformed runtime payload %# before authentication or database access", async (payload) => {
    await expect(createAnnotationReplyAction(payload as never)).resolves.toMatchObject({ ok: false });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
