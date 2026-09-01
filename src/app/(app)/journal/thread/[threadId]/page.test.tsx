import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLetterThreadDetail, getJournalEntry, getReadableImageUrl, notFound } = vi.hoisted(() => ({
  getLetterThreadDetail: vi.fn(),
  getJournalEntry: vi.fn(),
  getReadableImageUrl: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/journal/thread-repository", () => ({ getLetterThreadDetail }));
vi.mock("@/features/journal/repository", () => ({ getJournalEntry }));
vi.mock("@/features/media/actions", () => ({ getReadableImageUrl }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn().mockResolvedValue({
    userId: "susan-id",
    profile: { partner_nickname: "Niki" },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    from: () => ({
      select: () => ({
        in: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      }),
    }),
  }),
}));
vi.mock("@/features/journal/components/LetterThreadDetail", () => ({
  LetterThreadDetail: ({ threadId, letters, counterpartName }: { threadId: string; letters: Array<{ plainText?: string | null }>; counterpartName: string }) => (
    <div>{threadId}:{counterpartName}:{letters.length}:{letters[0]?.plainText ?? "empty"}</div>
  ),
}));

describe("letter thread route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLetterThreadDetail.mockResolvedValue([{
      threadId: "thread-1", letterId: "letter-1", authorId: "niki-id", recipientId: "susan-id",
      entryType: "today", bodyVisible: true, withdrawnAt: null, plainText: "hello", imagePath: null,
    }]);
    getJournalEntry.mockResolvedValue(null);
  });

  it("loads the viewer-safe thread contract and renders the minimal thread route", async () => {
    const Page = (await import("./page")).default;
    render(await Page({ params: Promise.resolve({ threadId: "thread-1" }), searchParams: Promise.resolve({ letter: "letter-1" }) }));
    expect(getLetterThreadDetail).toHaveBeenCalledWith(expect.anything(), "thread-1");
    expect(screen.getByText("thread-1:Niki:1:hello")).toBeInTheDocument();
  });

  it("hydrates an opened legacy capsule body through the existing RLS-protected reader", async () => {
    getLetterThreadDetail.mockResolvedValue([{
      threadId: "thread-1", letterId: "capsule-1", authorId: "niki-id", recipientId: "susan-id",
      entryType: "future", bodyVisible: true, withdrawnAt: null, plainText: null, richContent: null,
      excerpt: null, imagePath: null,
    }]);
    getJournalEntry.mockResolvedValue({ content: "legacy capsule body", plainText: "legacy capsule body" });

    const Page = (await import("./page")).default;
    render(await Page({ params: Promise.resolve({ threadId: "thread-1" }), searchParams: Promise.resolve({}) }));

    expect(getJournalEntry).toHaveBeenCalledWith(expect.anything(), "capsule-1");
    expect(screen.getByText("thread-1:Niki:1:legacy capsule body")).toBeInTheDocument();
  });

  it("never widens hidden or withdrawn thread rows through the legacy reader", async () => {
    getLetterThreadDetail.mockResolvedValue([
      {
        threadId: "thread-1", letterId: "sealed-1", entryType: "future",
        bodyVisible: false, withdrawnAt: null, plainText: null, richContent: null, excerpt: null, imagePath: null,
      },
      {
        threadId: "thread-1", letterId: "withdrawn-1", entryType: "future",
        bodyVisible: true, withdrawnAt: "2026-09-01T00:00:00Z", plainText: null, richContent: null, excerpt: null, imagePath: null,
      },
    ]);

    const Page = (await import("./page")).default;
    render(await Page({ params: Promise.resolve({ threadId: "thread-1" }), searchParams: Promise.resolve({}) }));

    expect(getJournalEntry).not.toHaveBeenCalled();
  });
});
