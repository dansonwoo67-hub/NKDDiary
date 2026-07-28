import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { notFound, getJournalEntry, requireUser, createServerSupabaseClient } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
  getJournalEntry: vi.fn(),
  requireUser: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/journal/repository", () => ({ getJournalEntry }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/features/journal/components/LetterReaderV1", () => ({
  LetterReaderV1: ({ entry }: { entry: { plainText: string } }) => <div>{entry.plainText}</div>,
}));

import JournalEntryPage from "./page";

const id = "33333333-3333-4333-8333-333333333333";
const normalEntry = {
  id,
  authorId: "author-1",
  recipientId: "recipient-1",
  withdrawnAt: null,
  plainText: "正常信件正文",
};

function clientWithWithdrawalStatus(data: unknown) {
  const order = vi.fn().mockResolvedValue({ data: [], error: null });
  const is = vi.fn().mockReturnValue({ order });
  const eq = vi.fn().mockReturnValue({ is });
  const select = vi.fn().mockReturnValue({ eq });
  return {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
    from: vi.fn().mockReturnValue({ select }),
  };
}

describe("JournalEntryPage withdrawn letter state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({
      userId: "recipient-1",
      profile: { display_name: "Niki" },
    });
  });
  afterEach(cleanup);

  it("renders a normal letter body without consulting withdrawal status", async () => {
    const client = clientWithWithdrawalStatus([]);
    createServerSupabaseClient.mockResolvedValue(client);
    getJournalEntry.mockResolvedValue(normalEntry);

    render(await JournalEntryPage({ params: Promise.resolve({ id }) }));

    expect(screen.getByText("正常信件正文")).toBeInTheDocument();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("renders the withdrawn message instead of 404 when RLS hides the body", async () => {
    const client = clientWithWithdrawalStatus([{ id, withdrawn_at: "2026-07-28T01:00:00Z" }]);
    createServerSupabaseClient.mockResolvedValue(client);
    getJournalEntry.mockResolvedValue(null);

    render(await JournalEntryPage({ params: Promise.resolve({ id }) }));

    expect(screen.getByText("这封信已经被对方撤回")).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("正常信件正文");
    expect(client.rpc).toHaveBeenCalledWith("get_letter_withdrawal_status", { p_entry_id: id });
  });

  it("does not render the body when the author opens an already withdrawn letter", async () => {
    const client = clientWithWithdrawalStatus([]);
    createServerSupabaseClient.mockResolvedValue(client);
    getJournalEntry.mockResolvedValue({
      ...normalEntry,
      authorId: "recipient-1",
      withdrawnAt: "2026-07-28T01:00:00Z",
      plainText: "已经撤回的敏感正文",
    });

    render(await JournalEntryPage({ params: Promise.resolve({ id }) }));

    expect(screen.getByText("这封信已经被对方撤回")).toBeInTheDocument();
    expect(screen.queryByText("已经撤回的敏感正文")).not.toBeInTheDocument();
  });
});
