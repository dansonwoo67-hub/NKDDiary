import "@testing-library/jest-dom/vitest";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalPageClient } from "./JournalPageClient";

const refresh = vi.fn();
const rpc = vi.fn().mockResolvedValue({
  data: {
    used_today: 0,
    limit: 1,
    remaining: 1,
    is_limit_reached: false,
    reset_at: "2026-07-29T16:00:00.000Z",
  },
  error: null,
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));
vi.mock("@/features/journal/draft-actions", () => ({
  deleteDraftAction: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({ rpc }),
}));

const props = {
  threads: [],
  partnerId: "partner-1",
  partnerName: "Niki",
  userId: "susan",
  draft: null,
};
const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const previousActEnvironment = reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;

describe("JournalPageClient draft hydration", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeAll(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
    cleanup();
  });

  it("does not read localStorage while rendering on the server", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    expect(() => renderToString(<JournalPageClient {...props} />)).not.toThrow();
    expect(getItem).not.toHaveBeenCalled();
  });

  it("restores regular and capsule drafts after client hydration", async () => {
    localStorage.setItem("nkddiary_letter_draft_susan", JSON.stringify({
      authorId: "susan",
      recipientId: "partner-1",
      html: "<p>普通信草稿</p>",
      text: "普通信草稿",
      plainText: "普通信草稿",
      stationeryTheme: "cream",
      moodEmoji: "💌",
      draftId: "draft-1",
      updatedAt: "2026-07-28T08:00:00.000Z",
    }));
    localStorage.setItem("nkddiary_capsule_draft_susan", JSON.stringify({
      authorId: "susan",
      recipientId: "partner-1",
      html: "<p>胶囊信草稿</p>",
      text: "胶囊信草稿",
      stationeryTheme: "cream",
      moodEmoji: "✨",
      openAt: "2026-08-28T08:00:00.000Z",
      updatedAt: "2026-07-28T08:00:00.000Z",
    }));

    const serverHtml = renderToString(<JournalPageClient {...props} />);
    expect(serverHtml).not.toContain("未完成的信");
    expect(serverHtml).not.toContain("未完成的胶囊信");

    container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    await act(async () => {
      root = hydrateRoot(container!, <JournalPageClient {...props} />);
    });

    await waitFor(() => {
      expect(screen.getByText("未完成的信")).toBeVisible();
      expect(screen.getByText("未完成的胶囊信")).toBeVisible();
    });
    expect(screen.getByText(/普通信草稿/)).toBeVisible();
    expect(screen.getByText(/胶囊信草稿/)).toBeVisible();
  });
});
