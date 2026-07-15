import { describe, expect, it, vi } from "vitest";
import { createAnnotation, validateCreateAnnotationInput, type AnnotationGateway } from "./create-annotation-core";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PARTNER_ID = "22222222-2222-4222-8222-222222222222";
const LETTER_ID = "33333333-3333-4333-8333-333333333333";

function validInput() {
  return {
    letterId: LETTER_ID,
    blockId: "p:1.part",
    quotedText: " 😀 ",
    startOffset: 2,
    endOffset: 6,
    comment: "  我看见啦  ",
  };
}

function richBody(blockId = "p:1.part") {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId },
        content: [
          { type: "text", text: "xx" },
          { type: "text", marks: [{ type: "bold" }], text: " 😀 " },
          { type: "text", text: "yy" },
        ],
      },
    ],
  };
}

function gateway(overrides: Partial<AnnotationGateway> = {}): AnnotationGateway {
  return {
    getPublishedLetter: vi.fn().mockResolvedValue({
      id: LETTER_ID,
      authorId: PARTNER_ID,
      letterDate: "2026-07-15",
      bodyJson: richBody(),
      bodyText: "xx 😀 yy",
    }),
    insertAnnotation: vi.fn().mockResolvedValue({ ok: true }),
    createNotification: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe("validateCreateAnnotationInput", () => {
  it("preserves the exact quote and only trims the comment", () => {
    expect(validateCreateAnnotationInput(validInput())).toEqual({
      ok: true,
      value: { ...validInput(), quotedText: " 😀 ", comment: "我看见啦" },
    });
  });

  it("rejects invalid IDs, block IDs, offsets, quote lengths, and limits", () => {
    const badInputs = [
      { ...validInput(), letterId: "not-a-uuid" },
      { ...validInput(), blockId: "bad id" },
      { ...validInput(), startOffset: 1.5 },
      { ...validInput(), startOffset: -1 },
      { ...validInput(), startOffset: 7, endOffset: 6 },
      { ...validInput(), endOffset: 5 },
      { ...validInput(), quotedText: "   ", startOffset: 0, endOffset: 3 },
      { ...validInput(), quotedText: "x".repeat(1001), startOffset: 0, endOffset: 1001 },
      { ...validInput(), comment: "x".repeat(1001) },
    ];

    for (const input of badInputs) expect(validateCreateAnnotationInput(input)).toMatchObject({ ok: false });
  });

  it("rejects missing runtime fields without throwing", () => {
    expect(() => validateCreateAnnotationInput({ letterId: LETTER_ID } as ReturnType<typeof validInput>)).not.toThrow();
    expect(validateCreateAnnotationInput({ letterId: LETTER_ID } as ReturnType<typeof validInput>)).toMatchObject({ ok: false });
  });
});

describe("createAnnotation", () => {
  it("stores a stable anchor and notifies the partner for a readable published letter", async () => {
    const repo = gateway();
    const result = await createAnnotation(validInput(), {
      userId: USER_ID,
      displayName: "Dang",
      gateway: repo,
    });

    expect(result).toEqual({ ok: true, message: "评点已留下。", letterDate: "2026-07-15" });
    expect(repo.insertAnnotation).toHaveBeenCalledWith({
      letterId: LETTER_ID,
      authorId: USER_ID,
      blockId: "p:1.part",
      quotedText: " 😀 ",
      startOffset: 2,
      endOffset: 6,
      comment: "我看见啦",
    });
    expect(repo.createNotification).toHaveBeenCalledWith({
      recipientId: PARTNER_ID,
      letterId: LETTER_ID,
      title: "Dang 评点了你的信",
      body: " 😀 ",
    });
  });

  it("does not write when the published letter is not readable", async () => {
    const repo = gateway({ getPublishedLetter: vi.fn().mockResolvedValue(null) });
    const result = await createAnnotation(validInput(), {
      userId: USER_ID,
      displayName: "Dang",
      gateway: repo,
    });

    expect(result).toEqual({ ok: false, message: "没有找到可评点的已发布信件。" });
    expect(repo.insertAnnotation).not.toHaveBeenCalled();
  });

  it("does not notify an author commenting on their own published letter", async () => {
    const repo = gateway({
      getPublishedLetter: vi.fn().mockResolvedValue({
        id: LETTER_ID,
        authorId: USER_ID,
        letterDate: "2026-07-15",
        bodyJson: richBody(),
        bodyText: "xx 😀 yy",
      }),
    });
    await createAnnotation(validInput(), { userId: USER_ID, displayName: "Dang", gateway: repo });
    expect(repo.createNotification).not.toHaveBeenCalled();
  });

  it("keeps a saved annotation successful when notification delivery fails", async () => {
    const repo = gateway({
      createNotification: vi.fn().mockResolvedValue({ ok: false, message: "notification failed" }),
    });
    const result = await createAnnotation(validInput(), { userId: USER_ID, displayName: "Dang", gateway: repo });
    expect(result).toEqual({ ok: true, message: "评点已留下。", letterDate: "2026-07-15" });
  });

  it("validates nested marked text with UTF-16 emoji offsets", async () => {
    const repo = gateway();
    const result = await createAnnotation(validInput(), { userId: USER_ID, displayName: "Dang", gateway: repo });
    expect(result.ok).toBe(true);
    expect(repo.insertAnnotation).toHaveBeenCalledOnce();
  });

  it("aligns hard breaks with DOM textContent by contributing no offset", async () => {
    const repo = gateway({
      getPublishedLetter: vi.fn().mockResolvedValue({
        id: LETTER_ID,
        authorId: PARTNER_ID,
        letterDate: "2026-07-15",
        bodyJson: {
          type: "doc",
          content: [{
            type: "paragraph",
            attrs: { blockId: "p-1" },
            content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "😀z" }],
          }],
        },
        bodyText: "a\n😀z",
      }),
    });
    const result = await createAnnotation(
      { ...validInput(), blockId: "p-1", quotedText: "a😀", startOffset: 0, endOffset: 3 },
      { userId: USER_ID, displayName: "Dang", gateway: repo },
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ["missing block", richBody("other")],
    ["duplicate block", {
      type: "doc",
      content: [richBody().content[0], richBody().content[0]],
    }],
    ["malformed document", { type: "doc", content: [{ type: "text", text: 42 }] }],
  ])("rejects %s without inserting", async (_label, bodyJson) => {
    const repo = gateway({
      getPublishedLetter: vi.fn().mockResolvedValue({
        id: LETTER_ID,
        authorId: PARTNER_ID,
        letterDate: "2026-07-15",
        bodyJson,
        bodyText: "xx 😀 yy",
      }),
    });
    const result = await createAnnotation(validInput(), { userId: USER_ID, displayName: "Dang", gateway: repo });
    expect(result).toEqual({ ok: false, message: "选中文字与已发布正文不一致。" });
    expect(repo.insertAnnotation).not.toHaveBeenCalled();
  });

  it("rejects an offset or quote that does not match the stored block", async () => {
    const repo = gateway();
    const result = await createAnnotation(
      { ...validInput(), quotedText: "yy", startOffset: 0, endOffset: 2 },
      { userId: USER_ID, displayName: "Dang", gateway: repo },
    );
    expect(result).toEqual({ ok: false, message: "选中文字与已发布正文不一致。" });
    expect(repo.insertAnnotation).not.toHaveBeenCalled();
  });

  it("allows legacy-body only when the document has no stable block IDs", async () => {
    const repo = gateway({
      getPublishedLetter: vi.fn().mockResolvedValue({
        id: LETTER_ID,
        authorId: PARTNER_ID,
        letterDate: "2026-07-15",
        bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "xx 😀 yy" }] }] },
        bodyText: "xx 😀 yy",
      }),
    });
    const result = await createAnnotation(
      { ...validInput(), blockId: "legacy-body" },
      { userId: USER_ID, displayName: "Dang", gateway: repo },
    );
    expect(result.ok).toBe(true);
  });

  it("does not let a rich document bypass block checks through legacy-body", async () => {
    const repo = gateway();
    const result = await createAnnotation(
      { ...validInput(), blockId: "legacy-body" },
      { userId: USER_ID, displayName: "Dang", gateway: repo },
    );
    expect(result).toEqual({ ok: false, message: "选中文字与已发布正文不一致。" });
    expect(repo.insertAnnotation).not.toHaveBeenCalled();
  });

  it("rejects documents beyond the traversal budget", async () => {
    let node: Record<string, unknown> = { type: "text", text: "x" };
    for (let depth = 0; depth < 80; depth += 1) node = { type: "blockquote", content: [node] };
    const repo = gateway({
      getPublishedLetter: vi.fn().mockResolvedValue({
        id: LETTER_ID,
        authorId: PARTNER_ID,
        letterDate: "2026-07-15",
        bodyJson: { type: "doc", content: [node] },
        bodyText: "x",
      }),
    });
    const result = await createAnnotation(validInput(), { userId: USER_ID, displayName: "Dang", gateway: repo });
    expect(result).toMatchObject({ ok: false });
    expect(repo.insertAnnotation).not.toHaveBeenCalled();
  });

  it("rejects documents beyond node and text budgets", async () => {
    const oversizedBodies = [
      {
        type: "doc",
        content: Array.from({ length: 10_001 }, (_, index) => ({
          type: "paragraph",
          attrs: { blockId: `p-${index}` },
        })),
      },
      {
        type: "doc",
        content: [{
          type: "paragraph",
          attrs: { blockId: "p:1.part" },
          content: [{ type: "text", text: "x".repeat(100_001) }],
        }],
      },
    ];

    for (const bodyJson of oversizedBodies) {
      const repo = gateway({
        getPublishedLetter: vi.fn().mockResolvedValue({
          id: LETTER_ID,
          authorId: PARTNER_ID,
          letterDate: "2026-07-15",
          bodyJson,
          bodyText: "xx 😀 yy",
        }),
      });
      const result = await createAnnotation(validInput(), { userId: USER_ID, displayName: "Dang", gateway: repo });
      expect(result).toMatchObject({ ok: false });
      expect(repo.insertAnnotation).not.toHaveBeenCalled();
    }
  });
});
