import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUnreadNotifications } from "./actions";

const mockRequireUser = vi.mocked(requireUser);
const mockCreateClient = vi.mocked(createServerSupabaseClient);

describe("notification routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ userId: "user-1" } as never);
  });

  it("links a future diary opened notification directly to its diary", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{
        id: "notice-1",
        type: "future_diary_opened",
        source_id: "33333333-3333-4333-8333-333333333333",
        title: "未来日记已被开启",
        body: "对方打开了你封存的未来日记。",
        created_at: "2026-08-01T12:00:00Z",
      }],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mockCreateClient.mockResolvedValue({ from } as never);

    await expect(getUnreadNotifications()).resolves.toEqual([expect.objectContaining({
      href: "/journal/33333333-3333-4333-8333-333333333333",
    })]);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
