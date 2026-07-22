import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/journal/repository", () => ({
  getFutureDiaryRecipient: vi.fn().mockResolvedValue({ id: "partner-1", displayName: "小楠" }),
  listFutureDiaryCards: vi.fn(),
  listSentFutureDiaryEntries: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/features/journal/components/FutureDiaryCard", () => ({
  FutureDiaryCard: ({ role, entry }: { role: string; entry: { id: string; title?: string } }) => (
    <div data-testid={`${role}-${entry.id}`}>{entry.title}</div>
  ),
}));

import { listFutureDiaryCards, listSentFutureDiaryEntries } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import FutureDiaryPage from "./page";

const mockReceived = vi.mocked(listFutureDiaryCards);
const mockSent = vi.mocked(listSentFutureDiaryEntries);

describe("FutureDiaryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      userId: "author-1",
      spaceId: "space-1",
      profile: { display_name: "小丹" } as never,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
    mockReceived.mockResolvedValue([]);
    mockSent.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it("uses only safe metadata for the received filter", async () => {
    render(await FutureDiaryPage({ searchParams: Promise.resolve({ box: "received" }) }));
    expect(screen.getByRole("heading", { name: "收到的未来日记" })).toBeVisible();
    expect(mockReceived).toHaveBeenCalledWith(expect.anything(), { userId: "author-1", box: "received" });
    expect(mockSent).not.toHaveBeenCalled();
  });

  it("uses only author-authorized full rows for the sent filter", async () => {
    render(await FutureDiaryPage({ searchParams: Promise.resolve({ box: "sent" }) }));
    expect(screen.getByRole("heading", { name: "我写出的未来日记" })).toBeVisible();
    expect(mockSent).toHaveBeenCalledWith(expect.anything(), "author-1");
    expect(mockReceived).not.toHaveBeenCalled();
  });
});
