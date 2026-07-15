import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createGateway: vi.fn(),
  deleteWithAssets: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("./private-letter-deletion", () => ({
  createPrivateLetterDeletionGateway: mocks.createGateway,
  deletePrivateLetterWithAssets: mocks.deleteWithAssets,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { deletePrivateLetterAction } from "./mutations";

describe("deletePrivateLetterAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ userId: "user-id" });
    mocks.createServerSupabaseClient.mockResolvedValue({ client: true });
    mocks.createGateway.mockReturnValue({ deletionGateway: true });
    mocks.deleteWithAssets.mockResolvedValue({ ok: true, message: "deleted" });
  });

  it("uses the recoverable storage-aware deletion flow instead of direct table deletion", async () => {
    const input = {
      id: "22222222-2222-4222-8222-222222222222",
      version: 3,
    };

    await expect(deletePrivateLetterAction(input)).resolves.toEqual({
      ok: true,
      message: "deleted",
    });

    expect(mocks.createGateway).toHaveBeenCalledWith({ client: true });
    expect(mocks.deleteWithAssets).toHaveBeenCalledWith(
      { deletionGateway: true },
      "user-id",
      input,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });
});
