import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
  useRouter: () => router,
}));
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

function clientWithNoComments() {
  const order = vi.fn().mockResolvedValue({ data: [], error: null });
  const is = vi.fn().mockReturnValue({ order });
  const eq = vi.fn().mockReturnValue({ is });
  const select = vi.fn().mockReturnValue({ eq });
  return { from: vi.fn().mockReturnValue({ select }), rpc: vi.fn() };
}

const legacyEntry = {
  id: "33333333-3333-4333-8333-333333333333",
  spaceId: "22222222-2222-4222-8222-222222222222",
  authorId: "11111111-1111-4111-8111-111111111111",
  recipientId: null,
  entryType: "today" as const,
  title: "历史标题",
  content: "不应暴露的历史正文",
  richHtml: null,
  plainText: "不应暴露的历史正文",
  excerpt: "不应暴露的历史正文",
  stationeryTheme: "cream",
  moodEmoji: null,
  withdrawnAt: null,
  deletedAt: null,
  purgeAt: null,
  starAt: null,
  imagePath: "private/path-never-rendered.webp",
  entryDate: "2026-07-19",
  publishedAt: "2026-07-19T10:00:00Z",
  updatedAt: "2026-07-19T11:00:00Z",
  lockedAt: "2099-07-20T10:00:00Z",
  sealedAt: null,
  openAt: null,
  openedAt: null,
};

describe("JournalEntryPage entry-kind routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      userId: legacyEntry.authorId,
      spaceId: legacyEntry.spaceId,
      profile: { display_name: "Susan" } as never,
    });
    mockCreateClient.mockResolvedValue(clientWithNoComments() as never);
    mockGetJournalEntry.mockResolvedValue(legacyEntry);
    mockGetReadableImageUrl.mockResolvedValue(null);
  });

  afterEach(cleanup);

  it("shows a safe notice for a legacy recipient-free today entry without exposing old product actions", async () => {
    render(await JournalEntryPage({ params: Promise.resolve({ id: legacyEntry.id }) }));

    expect(screen.getByRole("heading", { name: "这条历史内容暂不支持在当前版本查看" })).toBeVisible();
    expect(screen.queryByText(legacyEntry.content)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "编辑日记" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除日记" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤回" })).not.toBeInTheDocument();
    expect(screen.queryByText("返回信箱")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(legacyEntry.imagePath);
  });

  it.each([
    ["regular letter", { entryType: "today" as const, recipientId: "recipient-1" }],
    ["capsule letter", { entryType: "future" as const, recipientId: "recipient-1" }],
  ])("routes a %s through the letter reader", async (_label, overrides) => {
    mockGetJournalEntry.mockResolvedValue({
      ...legacyEntry,
      ...overrides,
      title: "",
      plainText: "写给对方的正文",
      content: "写给对方的正文",
      imagePath: null,
    });

    render(await JournalEntryPage({ params: Promise.resolve({ id: legacyEntry.id }) }));

    expect(screen.getByText("写给对方的正文")).toBeVisible();
    expect(screen.getByText("返回信箱")).toBeVisible();
  });
  it("renders a capsule image through a signed URL without exposing its storage path", async () => {
    const storagePath = `${legacyEntry.spaceId}/${legacyEntry.authorId}/${legacyEntry.id}.webp`;
    const signedUrl = "https://signed.example.test/capsule.webp?token=short-lived";
    mockGetJournalEntry.mockResolvedValue({
      ...legacyEntry,
      entryType: "future",
      recipientId: "recipient-1",
      title: "",
      content: "胶囊信正文",
      plainText: "胶囊信正文",
      imagePath: storagePath,
    });
    mockGetReadableImageUrl.mockResolvedValue(signedUrl);

    render(await JournalEntryPage({ params: Promise.resolve({ id: legacyEntry.id }) }));

    expect(screen.getByRole("img", { name: "信件图片" })).toHaveAttribute("src", signedUrl);
    expect(mockGetReadableImageUrl).toHaveBeenCalledWith(legacyEntry.id);
    expect(document.body.innerHTML).not.toContain(storagePath);
  });

  it("server-renders a capsule detail without browser globals", async () => {
    mockGetJournalEntry.mockResolvedValue({
      ...legacyEntry,
      entryType: "future",
      recipientId: "recipient-1",
      title: "",
      content: "胶囊信正文",
      plainText: "胶囊信正文",
      imagePath: null,
    });
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("navigator", undefined);

    try {
      const page = await JournalEntryPage({ params: Promise.resolve({ id: legacyEntry.id }) });
      expect(() => renderToString(page)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
