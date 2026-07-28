import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LetterListItem } from "@/features/journal/letter-repository";
import { EnvelopeLetterCard } from "./EnvelopeLetterCard";

vi.mock("@/features/journal/letter-actions", () => ({
  toggleStarAction: vi.fn(),
}));

const letter: LetterListItem = {
  id: "33333333-3333-4333-8333-333333333333",
  spaceId: "space-1",
  authorId: "user-2",
  recipientId: "user-1",
  entryType: "today",
  title: "",
  excerpt: "想和你分享今天。",
  stationeryTheme: "cream",
  moodEmoji: null,
  imagePath: null,
  entryDate: "2026-07-28",
  publishedAt: "2026-07-28T02:00:00Z",
  createdAt: "2026-07-28T02:00:00Z",
  updatedAt: "2026-07-28T02:00:00Z",
  lockedAt: "2099-07-29T02:00:00Z",
  sealedAt: null,
  openAt: null,
  openedAt: null,
  withdrawnAt: null,
  deletedAt: null,
  purgeAt: null,
  starAt: null,
  commentCount: 0,
};

describe("EnvelopeLetterCard unread source", () => {
  afterEach(cleanup);

  it("does not treat an unopened row as unread without an unread notification", () => {
    render(
      <EnvelopeLetterCard
        letter={letter}
        mode="inbox"
        personName="Niki"
        userId="user-1"
        isUnread={false}
      />,
    );

    expect(screen.getByRole("link")).not.toHaveClass("border-[var(--rose)]");
  });

  it("shows an unread notification even when the letter was already opened", () => {
    render(
      <EnvelopeLetterCard
        letter={{ ...letter, openedAt: "2026-07-28T03:00:00Z" }}
        mode="inbox"
        personName="Niki"
        userId="user-1"
        isUnread
      />,
    );

    expect(screen.getByRole("link")).toHaveClass("border-[var(--rose)]");
  });
});
