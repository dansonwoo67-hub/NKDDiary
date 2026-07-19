import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/journal/actions", () => ({ deleteTodayDiaryAction: vi.fn() }));
vi.mock("@/features/journal/repository", () => ({ getJournalEntry: vi.fn() }));
vi.mock("@/features/media/actions", () => ({ getReadableImageUrl: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getJournalEntry } from "@/features/journal/repository";
import { getReadableImageUrl } from "@/features/media/actions";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import JournalEntryPage from "./page";

const mockGetJournalEntry = vi.mocked(getJournalEntry);
const mockGetReadableImageUrl = vi.mocked(getReadableImageUrl);
const mockRequireUser = vi.mocked(requireUser);
const mockCreateClient = vi.mocked(createServerSupabaseClient);

const entry = {
  id: "33333333-3333-4333-8333-333333333333",
  spaceId: "22222222-2222-4222-8222-222222222222",
  authorId: "11111111-1111-4111-8111-111111111111",
  recipientId: null,
  entryType: "today" as const,
  title: "普通的一天",
  content: "今天一起散步。",
  imagePath: "private/path-never-rendered.webp",
  entryDate: "2026-07-19",
  publishedAt: "2026-07-19T10:00:00Z",
  updatedAt: "2026-07-19T11:00:00Z",
  lockedAt: "2099-07-20T10:00:00Z",
  sealedAt: null,
  openAt: null,
  openedAt: null,
};

describe("JournalEntryPage private image read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      userId: entry.authorId,
      spaceId: entry.spaceId,
      profile: { display_name: "小丹" } as never,
    });
    mockCreateClient.mockResolvedValue({} as never);
    mockGetJournalEntry.mockResolvedValue(entry);
  });

  afterEach(cleanup);

  it("renders only the permission-gated signed URL for an entry with an image", async () => {
    mockGetReadableImageUrl.mockResolvedValue("https://storage.example/signed-token");

    render(await JournalEntryPage({ params: Promise.resolve({ id: entry.id }) }));

    const image = screen.getByRole("img", { name: "日记图片" });
    expect(image).toHaveAttribute("src", "https://storage.example/signed-token");
    expect(document.body.innerHTML).not.toContain(entry.imagePath);
    expect(mockGetReadableImageUrl).toHaveBeenCalledWith(entry.id);
  });

  it("does not request a signed URL when the authorized row has no image", async () => {
    mockGetJournalEntry.mockResolvedValue({ ...entry, imagePath: null });

    render(await JournalEntryPage({ params: Promise.resolve({ id: entry.id }) }));

    expect(screen.queryByRole("img", { name: "日记图片" })).not.toBeInTheDocument();
    expect(mockGetReadableImageUrl).not.toHaveBeenCalled();
  });
});
