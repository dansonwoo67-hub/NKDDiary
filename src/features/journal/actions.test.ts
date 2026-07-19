import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createTodayDiaryAction,
  deleteTodayDiaryAction,
  openFutureDiaryAction,
  sealFutureDiaryAction,
  updateTodayDiaryAction,
} from "./actions";

const mockRequireUser = vi.mocked(requireUser);
const mockCreateClient = vi.mocked(createServerSupabaseClient);
const mockRevalidatePath = vi.mocked(revalidatePath);

function installClient(result: { data: unknown; error: unknown } = { data: { id: "entry-1" }, error: null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const from = vi.fn(() => {
    throw new Error("journal actions must call database functions, not tables");
  });
  mockCreateClient.mockResolvedValue({ rpc, from } as never);
  return { rpc, from };
}

describe("journal server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      spaceId: "22222222-2222-4222-8222-222222222222",
      profile: {} as never,
    });
  });

  it("seals a validated future diary through the narrow database function", async () => {
    const { rpc, from } = installClient();
    const input = {
      title: "  For later  ",
      content: "  Open this together  ",
      recipientId: "33333333-3333-4333-8333-333333333333",
      openAt: "2026-08-01T20:00:00+08:00",
      imagePath: null,
    };

    await expect(sealFutureDiaryAction(input)).resolves.toEqual({
      ok: true,
      message: "未来日记已封存。",
      entryId: "entry-1",
    });
    expect(rpc).toHaveBeenCalledWith("seal_future_diary", {
      p_space_id: "22222222-2222-4222-8222-222222222222",
      p_title: "For later",
      p_content: "Open this together",
      p_recipient_id: "33333333-3333-4333-8333-333333333333",
      p_open_at: "2026-08-01T20:00:00+08:00",
      p_image_path: null,
    });
    expect(from).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/journal/future");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/journal/entry-1");
  });

  it("rejects invalid future content before authenticating or calling the database", async () => {
    const { rpc } = installClient();

    const result = await sealFutureDiaryAction({
      title: " ",
      content: "body",
      recipientId: "not-a-uuid",
      openAt: "2026-08-01T12:00:00Z",
      imagePath: null,
    });

    expect(result.ok).toBe(false);
    expect(mockRequireUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the future quota unique violation without leaking database details", async () => {
    installClient({ data: null, error: { code: "23505", message: "index details" } });

    await expect(
      sealFutureDiaryAction({
        title: "For later",
        content: "Open this together",
        recipientId: "33333333-3333-4333-8333-333333333333",
        openAt: "2026-08-01T20:00:00+08:00",
        imagePath: null,
      }),
    ).resolves.toEqual({ ok: false, message: "今天已经写过一篇未来日记了。" });
  });

  it("creates, updates, opens, and deletes only through lifecycle RPCs", async () => {
    const { rpc, from } = installClient();

    await createTodayDiaryAction({
      title: "Today",
      content: "A good day",
      entryDate: "2026-07-19",
      imagePath: null,
    });
    await updateTodayDiaryAction("44444444-4444-4444-8444-444444444444", {
      title: "Updated",
      content: "Updated body",
      imagePath: null,
    });
    await openFutureDiaryAction("55555555-5555-4555-8555-555555555555");
    await deleteTodayDiaryAction("44444444-4444-4444-8444-444444444444");

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "create_today_diary",
      "update_today_diary",
      "open_future_diary",
      "delete_today_diary",
    ]);
    expect(from).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/journal");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/journal/future");
  });
});
