import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LetterThreadDetail } from "./LetterThreadDetail";

const { replyToLetterAction, resendWithdrawnLetterAction, withdrawLetterAction, refresh } = vi.hoisted(() => ({
  replyToLetterAction: vi.fn(),
  resendWithdrawnLetterAction: vi.fn(),
  withdrawLetterAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/features/journal/letter-actions", () => ({
  replyToLetterAction,
  resendWithdrawnLetterAction,
  withdrawLetterAction,
}));
vi.mock("./OpenFutureDiaryButton", () => ({
  OpenFutureDiaryButton: ({ entryId }: { entryId: string }) => <button>开启胶囊 {entryId}</button>,
}));
vi.mock("./CommentSection", () => ({ CommentSection: () => <div>评论区</div> }));

const base = (overrides: Record<string, unknown> = {}) => ({
  threadId: "thread-1",
  letterId: "letter-1",
  replyToId: null,
  authorId: "niki-id",
  recipientId: "susan-id",
  entryType: "today" as const,
  publishedAt: new Date(Date.now() - 60_000).toISOString(),
  openAt: null,
  openedAt: null,
  withdrawnAt: null,
  bodyVisible: true,
  title: null,
  richContent: { type: "doc", html: "<p>原信正文</p>", text: "原信正文" },
  plainText: "原信正文",
  excerpt: "原信摘要",
  stationeryTheme: "cream",
  moodEmoji: null,
  imagePath: null,
  replyAllowed: true,
  resendAllowed: false,
  threadCount: 1,
  ...overrides,
});

function renderDetail(letters = [base()], viewerId = "susan-id") {
  return render(
    <LetterThreadDetail
      threadId="thread-1"
      viewerId={viewerId}
      counterpartName="Niki"
      letters={letters as never}
      imageUrls={{}}
      commentsByLetter={{}}
      currentTime={new Date().toISOString()}
    />,
  );
}

describe("LetterThreadDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replyToLetterAction.mockResolvedValue({ ok: true, message: "回信已寄出。", entryId: "reply-1" });
    resendWithdrawnLetterAction.mockResolvedValue({ ok: true, message: "新信已寄出。", entryId: "resend-1" });
    withdrawLetterAction.mockResolvedValue({ ok: true, message: "信件已撤回。" });
  });
  afterEach(cleanup);

  it("renders backend order and backend thread count without recounting visible rows", () => {
    renderDetail([
      base({ letterId: "letter-b", plainText: "第一封", richContent: null, threadCount: 7 }),
      base({ letterId: "letter-a", plainText: "第二封", richContent: null, threadCount: 7 }),
    ]);
    const letters = screen.getAllByTestId("thread-letter");
    expect(letters[0]).toHaveTextContent("第一封");
    expect(letters[1]).toHaveTextContent("第二封");
    expect(screen.getByText("往来 7 封")).toBeInTheDocument();
  });

  it("renders detail timestamp without locale-specific whitespace", () => {
    const { container } = renderDetail([base({ publishedAt: "2026-09-01T12:31:00Z" })]);
    expect(container.querySelector("time")?.textContent).toBe("2026/09/01 20:31");
  });

  it("allows replies to ordinary incoming letters and opened capsules, but not sealed capsules or withdrawn targets", () => {
    renderDetail([
      base({ letterId: "ordinary" }),
      base({ letterId: "opened-capsule", entryType: "future", openedAt: "2026-09-01T01:00:00Z" }),
      base({ letterId: "sealed-capsule", entryType: "future", openAt: "2026-08-31T01:00:00Z", bodyVisible: false, openedAt: null, replyAllowed: false, plainText: null, richContent: null }),
      base({ letterId: "withdrawn", withdrawnAt: "2026-09-01T02:00:00Z", bodyVisible: false, replyAllowed: false, plainText: null, richContent: null }),
    ]);
    expect(screen.getAllByRole("button", { name: "立即回信" })).toHaveLength(2);
    expect(screen.getByText(/开启胶囊 sealed-capsule/)).toBeInTheDocument();
  });

  it("does not expose capsule open action before the backend open time", () => {
    render(
      <LetterThreadDetail
        threadId="thread-1" viewerId="susan-id" counterpartName="Niki"
        letters={[base({
          letterId: "sealed-capsule", entryType: "future", openAt: "2026-09-02T01:00:00Z",
          bodyVisible: false, openedAt: null, replyAllowed: false, plainText: null, richContent: null,
        })] as never}
        imageUrls={{}} commentsByLetter={{}} currentTime="2026-09-01T01:00:00Z"
      />,
    );
    expect(screen.getByText(/距离可开启|正在同步开启时间/)).toBeInTheDocument();
    expect(screen.queryByText(/开启胶囊 sealed-capsule/)).not.toBeInTheDocument();
  });

  it("locks reply submission synchronously and closes after server success", async () => {
    let resolveReply: (value: unknown) => void = () => {};
    replyToLetterAction.mockImplementation(() => new Promise((resolve) => { resolveReply = resolve; }));
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "立即回信" }));
    expect(screen.getByText("回信给 Niki")).toBeInTheDocument();
    expect(screen.getByText("「原信摘要」")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "信件内容" }), { target: { value: "这是回信" } });
    const send = screen.getByRole("button", { name: "寄出回信" });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(replyToLetterAction).toHaveBeenCalledTimes(1);
    resolveReply({ ok: true, message: "回信已寄出。", entryId: "reply-1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("requires withdrawal confirmation and never offers withdrawal for read or capsule letters", async () => {
    renderDetail([
      base({ letterId: "unread-own", authorId: "susan-id", recipientId: "niki-id", replyAllowed: false }),
      base({ letterId: "read-own", authorId: "susan-id", recipientId: "niki-id", openedAt: "2026-09-01T01:00:00Z", replyAllowed: false }),
      base({ letterId: "capsule-own", authorId: "susan-id", recipientId: "niki-id", entryType: "future", replyAllowed: false }),
    ]);
    expect(screen.getAllByRole("button", { name: "撤回" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "撤回" }));
    expect(screen.getByText("确定撤回这封信吗？")).toBeInTheDocument();
    expect(withdrawLetterAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确定撤回" }));
    await waitFor(() => expect(withdrawLetterAction).toHaveBeenCalledWith("unread-own"));
  });

  it("keeps recipient withdrawn content out of the DOM", () => {
    renderDetail([base({
      withdrawnAt: "2026-09-01T02:00:00Z", bodyVisible: false, replyAllowed: false,
      plainText: null, richContent: null, excerpt: null, imagePath: null,
    })]);
    expect(screen.getByText("对方撤回了一封信")).toBeInTheDocument();
    expect(screen.queryByText("原信正文")).not.toBeInTheDocument();
  });

  it("lets the sender explicitly expand withdrawn original content", () => {
    renderDetail([base({
      authorId: "susan-id", recipientId: "niki-id", withdrawnAt: "2026-09-01T02:00:00Z",
      replyAllowed: false, resendAllowed: true,
    })]);
    expect(screen.getByText("这封信已撤回")).toBeInTheDocument();
    expect(screen.queryByText("原信正文")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看原文" }));
    expect(screen.getByText("原信正文")).toBeInTheDocument();
  });

  it("prefills resend composer and removes repeat resend action after server-confirmed refresh data", () => {
    const { rerender } = renderDetail([base({
      authorId: "susan-id", recipientId: "niki-id", withdrawnAt: "2026-09-01T02:00:00Z",
      replyAllowed: false, resendAllowed: true, plainText: "允许修改的原文",
    })]);
    fireEvent.click(screen.getByRole("button", { name: "重新编辑并发送" }));
    expect(screen.getByRole("textbox", { name: "信件内容" })).toHaveValue("允许修改的原文");
    rerender(
      <LetterThreadDetail
        threadId="thread-1" viewerId="susan-id" counterpartName="Niki"
        letters={[base({ authorId: "susan-id", recipientId: "niki-id", withdrawnAt: "2026-09-01T02:00:00Z", replyAllowed: false, resendAllowed: false })] as never}
        imageUrls={{}} commentsByLetter={{}}
        currentTime={new Date().toISOString()}
      />,
    );
    expect(screen.queryByRole("button", { name: "重新编辑并发送" })).not.toBeInTheDocument();
  });
});
