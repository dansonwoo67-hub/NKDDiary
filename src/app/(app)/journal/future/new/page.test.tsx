import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/journal/repository", () => ({ getFutureDiaryRecipient: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/features/journal/components/CapsuleLetterComposer", () => ({
  CapsuleLetterComposer: ({ recipientName }: { recipientName: string }) => <div>写给未来的 {recipientName}</div>,
}));

import { getFutureDiaryRecipient } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import NewFutureDiaryPage from "./page";

describe("NewFutureDiaryPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("binds the form recipient from the authenticated couple membership", async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: "author-1", spaceId: "space-1", profile: {} as never });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
    vi.mocked(getFutureDiaryRecipient).mockResolvedValue({ id: "partner-1", displayName: "小楠" });

    render(await NewFutureDiaryPage());
    expect(screen.getByText("写给未来的 小楠")).toBeVisible();
    expect(getFutureDiaryRecipient).toHaveBeenCalledWith(expect.anything(), { userId: "author-1", spaceId: "space-1" });
  });
});
