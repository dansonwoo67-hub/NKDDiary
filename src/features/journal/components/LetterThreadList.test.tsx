import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LetterThreadList } from "./LetterThreadList";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const thread = (overrides: Record<string, unknown> = {}) => ({
  threadId: "thread-1",
  counterpartId: "niki-id",
  latestActivityAt: "2026-09-01T12:31:00Z",
  latestLetterId: "letter-2",
  latestPreview: "今天突然很想你……",
  letterCount: 4,
  originType: "today" as const,
  rootOpenAt: null,
  rootOpenedAt: null,
  latestWithdrawn: false,
  unread: true,
  ...overrides,
});

describe("LetterThreadList", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("renders one card per backend thread and uses backend letter_count", () => {
    render(<LetterThreadList accountId="susan-id" counterpartName="Niki" threads={[
      thread(),
      thread({ threadId: "thread-2", latestLetterId: "letter-9", latestPreview: "晚安", letterCount: 1 }),
    ]} />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("往来 4 封")).toBeInTheDocument();
    expect(screen.getByText("往来 1 封")).toBeInTheDocument();
    expect(screen.queryAllByText("今天突然很想你……")).toHaveLength(1);
  });

  it("preserves deterministic backend order and exposes unread, capsule, and withdrawn state", () => {
    render(<LetterThreadList accountId="susan-id" counterpartName="Niki" threads={[
      thread({ threadId: "newer", latestPreview: "较新", originType: "future", latestWithdrawn: true }),
      thread({ threadId: "older", latestPreview: "较旧", unread: false }),
    ]} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/journal/thread/newer");
    expect(links[1]).toHaveAttribute("href", "/journal/thread/older");
    expect(screen.getByText("始于一封胶囊信")).toBeInTheDocument();
    expect(screen.getByText("最新信件已撤回")).toBeInTheDocument();
    expect(screen.getByText("未读")).toBeInTheDocument();
  });

  it("renders timestamp with deterministic ASCII separators for SSR hydration", () => {
    const { container } = render(
      <LetterThreadList accountId="susan-id" counterpartName="Niki" threads={[
        thread({ latestActivityAt: "2026-09-01T12:31:00Z" }),
      ]} />,
    );
    expect(container.querySelector("time")?.textContent).toBe("09/01 20:31");
  });

  it("resets rendered state when the account changes", () => {
    const { rerender } = render(
      <LetterThreadList accountId="susan-id" counterpartName="Niki" threads={[thread({ latestPreview: "Susan 的线程" })]} />,
    );
    rerender(
      <LetterThreadList accountId="niki-id" counterpartName="Susan" threads={[thread({ threadId: "niki-thread", latestPreview: "Niki 的线程" })]} />,
    );

    expect(screen.queryByText("Susan 的线程")).not.toBeInTheDocument();
    expect(screen.getByText("Niki 的线程")).toBeInTheDocument();
  });
});
