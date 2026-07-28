import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertLegacyCoupleMembership, requireUser, resolveMembership } from "./require-user";

const profile = {
  id: "user-1",
  login_name: "nkd",
  display_name: "NKD",
  avatar_url: null,
  last_login_at: null,
  last_login_latitude: null,
  last_login_longitude: null,
  relationship_started_on: "2024-01-01",
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

const mockCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const mockRedirect = vi.mocked(redirect);

function mockAuthenticatedClient(appMetadata: unknown, memberships: Array<{ user_id: string; space_id: string; active: boolean }> = [
  { user_id: "user-1", space_id: "space-1", active: true },
]) {
  const profileSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
  const profileEq = vi.fn().mockReturnValue({ single: profileSingle });
  const membershipEq = vi.fn().mockResolvedValue({ data: memberships, error: null });
  const from = vi.fn((table: string) => ({
    select: vi.fn().mockReturnValue({ eq: table === "profiles" ? profileEq : membershipEq }),
  }));

  mockCreateServerSupabaseClient.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: "user-1", app_metadata: appMetadata } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { email: "test@example.com" } },
      }),
    },
    from,
  } as never);

  return { from };
}

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the active database membership while retaining the explicit legacy gate", async () => {
    mockAuthenticatedClient({ nkd_diary_member: "true" });

    await expect(requireUser()).resolves.toEqual({ userId: "user-1", profile, spaceId: "space-1", email: "test@example.com" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("rejects a legacy-marked user without an active database membership", async () => {
    mockAuthenticatedClient({ nkd_diary_member: "true" }, []);

    await expect(requireUser()).rejects.toThrow("无权访问这个私人空间");
  });

  it("rejects a legacy-marked user with multiple active database memberships", async () => {
    mockAuthenticatedClient({ nkd_diary_member: "true" }, [
      { user_id: "user-1", space_id: "space-1", active: true },
      { user_id: "user-1", space_id: "space-2", active: true },
    ]);

    await expect(requireUser()).rejects.toThrow("无权访问这个私人空间");
  });

  it.each([
    ["missing", undefined],
    ["false", { nkd_diary_member: "false" }],
  ])("rejects a %s legacy membership marker before attempting profile access", async (_label, appMetadata) => {
    const { from } = mockAuthenticatedClient(appMetadata);

    await expect(requireUser()).rejects.toThrow("无权访问这个私人空间");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("assertLegacyCoupleMembership", () => {
  it("rejects users whose legacy membership marker is missing", () => {
    expect(() => assertLegacyCoupleMembership(undefined)).toThrow("无权访问这个私人空间");
  });

  it("rejects users whose legacy membership marker is false", () => {
    expect(() => assertLegacyCoupleMembership({ nkd_diary_member: "false" })).toThrow("无权访问这个私人空间");
  });

  it("accepts only the explicit legacy membership marker", () => {
    expect(() => assertLegacyCoupleMembership({ nkd_diary_member: "true" })).not.toThrow();
  });
});

describe("resolveMembership", () => {
  it("rejects authenticated users without an active couple membership", () => {
    expect(() => resolveMembership("user-3", [])).toThrow("无权访问这个私人空间");
  });

  it("returns the only active membership", () => {
    expect(resolveMembership("user-1", [{ user_id: "user-1", space_id: "space-1", active: true }])).toEqual({
      userId: "user-1",
      spaceId: "space-1",
    });
  });

  it("rejects multiple active memberships instead of choosing the first", () => {
    expect(() =>
      resolveMembership("user-1", [
        { user_id: "user-1", space_id: "space-1", active: true },
        { user_id: "user-1", space_id: "space-2", active: true },
      ]),
    ).toThrow("无权访问这个私人空间");
  });
});
