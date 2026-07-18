import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), createServerSupabaseClient: vi.fn(), createBookmarkGateway: vi.fn(),
  createExcerptBookmark: vi.fn(), toggleWholeLetterBookmark: vi.fn(), removeBookmark: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock("./supabase-gateway", () => ({ createBookmarkGateway: mocks.createBookmarkGateway }));
vi.mock("./core", () => ({
  createExcerptBookmark: mocks.createExcerptBookmark,
  toggleWholeLetterBookmark: mocks.toggleWholeLetterBookmark,
  removeBookmark: mocks.removeBookmark,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createBookmarkAction, removeBookmarkAction, toggleWholeLetterBookmarkAction } from "./actions";

describe("bookmark server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "viewer-id" });
    mocks.createServerSupabaseClient.mockResolvedValue({ client: true });
    mocks.createBookmarkGateway.mockReturnValue({ gateway: true });
    for (const operation of [mocks.createExcerptBookmark, mocks.toggleWholeLetterBookmark, mocks.removeBookmark]) {
      operation.mockResolvedValue({ ok: true, message: "ok" });
    }
  });

  it.each([
    ["excerpt", createBookmarkAction, { letterId: "l", blockId: "p", startOffset: 0, endOffset: 1, quotedText: "x" }, mocks.createExcerptBookmark],
    ["whole", toggleWholeLetterBookmarkAction, { letterId: "l" }, mocks.toggleWholeLetterBookmark],
    ["remove", removeBookmarkAction, { bookmarkId: "b" }, mocks.removeBookmark],
  ])("authenticates and scopes %s mutations through the viewer gateway", async (_label, action, input, operation) => {
    await action(input as never);
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.createBookmarkGateway).toHaveBeenCalledWith({ client: true }, "viewer-id");
    expect(operation).toHaveBeenCalledWith(input, { userId: "viewer-id", gateway: { gateway: true } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/me/bookmarks");
  });
});
