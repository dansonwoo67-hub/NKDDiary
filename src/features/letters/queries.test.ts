import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLettersForDate, getTodayLetterForEditor } from "./queries";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getChinaDateString: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock("@/lib/date/china-day", () => ({ getChinaDateString: mocks.getChinaDateString }));

describe("letter compatibility queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds an explicit daily-kind filter when selecting today's editor letter", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const supabase = { from: vi.fn(() => query) };
    mocks.requireUser.mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" });
    mocks.createServerSupabaseClient.mockResolvedValue(supabase);
    mocks.getChinaDateString.mockReturnValue("2026-07-15");

    await getTodayLetterForEditor();

    expect(supabase.from).toHaveBeenCalledWith("letters");
    expect(query.eq).toHaveBeenCalledWith("author_id", "11111111-1111-4111-8111-111111111111");
    expect(query.eq).toHaveBeenCalledWith("letter_date", "2026-07-15");
    expect(query.eq).toHaveBeenCalledWith("kind", "daily");
  });

  it("selects and maps body_json for the rich letter reader", async () => {
    const bodyJson = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p-1" } }] };
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({
      data: [{
        id: "letter-1",
        author_id: "partner",
        letter_date: "2026-07-15",
        body: "正文",
        body_json: bodyJson,
        body_text: "正文",
        profiles: { display_name: "NK", avatar_url: null },
        letter_open_responses: [],
        annotations: [],
      }],
      error: null,
    });
    mocks.requireUser.mockResolvedValue({ userId: "viewer" });
    const bookmarks = { select: vi.fn(), eq: vi.fn(), in: vi.fn() };
    bookmarks.select.mockReturnValue(bookmarks);
    bookmarks.eq.mockReturnValue(bookmarks);
    bookmarks.in.mockResolvedValue({ data: [], error: null });
    mocks.createServerSupabaseClient.mockResolvedValue({ from: vi.fn((table: string) => table === "letters" ? query : bookmarks) });

    const result = await getLettersForDate("2026-07-15");

    expect(query.select.mock.calls[0][0]).toContain("body_json");
    expect(result.letters[0].bodyJson).toBe(bodyJson);
  });

  it("fetches bookmark state once for the current viewer without joining partner bookmarks", async () => {
    const letterQuery = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
    letterQuery.select.mockReturnValue(letterQuery);
    letterQuery.eq.mockReturnValue(letterQuery);
    letterQuery.order.mockResolvedValue({
      data: [{
        id: "letter-1", author_id: "partner", letter_date: "2026-07-15",
        body: "正文", body_json: { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "p-1" } }] },
        body_text: "正文", profiles: { display_name: "NK", avatar_url: null },
        letter_open_responses: [], annotations: [],
      }],
      error: null,
    });
    const bookmarkQuery = { select: vi.fn(), eq: vi.fn(), in: vi.fn() };
    bookmarkQuery.select.mockReturnValue(bookmarkQuery);
    bookmarkQuery.eq.mockReturnValue(bookmarkQuery);
    bookmarkQuery.in.mockResolvedValue({ data: [{ letter_id: "letter-1", kind: "letter" }], error: null });
    const from = vi.fn((table: string) => table === "letters" ? letterQuery : bookmarkQuery);
    mocks.requireUser.mockResolvedValue({ userId: "viewer" });
    mocks.createServerSupabaseClient.mockResolvedValue({ from });

    const result = await getLettersForDate("2026-07-15");

    expect(from).toHaveBeenCalledTimes(2);
    expect(letterQuery.select.mock.calls[0][0]).not.toContain("bookmarks");
    expect(bookmarkQuery.eq).toHaveBeenCalledWith("owner_id", "viewer");
    expect(bookmarkQuery.in).toHaveBeenCalledWith("letter_id", ["letter-1"]);
    expect(result.letters[0].isBookmarked).toBe(true);
  });
});
