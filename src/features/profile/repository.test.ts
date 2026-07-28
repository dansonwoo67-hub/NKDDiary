import { describe, expect, it, vi } from "vitest";
import { ACTIVE_SPACE_PROFILE_FIELDS, listActiveSpaceProfiles } from "./repository";

describe("space profile repository", () => {
  it("queries profiles only for exact active member ids in the current space", async () => {
    const members = [{ user_id: "self" }, { user_id: "partner" }];
    const membershipEqActive = vi.fn().mockResolvedValue({ data: members, error: null });
    const membershipEqSpace = vi.fn().mockReturnValue({ eq: membershipEqActive });
    const membershipSelect = vi.fn().mockReturnValue({ eq: membershipEqSpace });
    const profileIn = vi.fn().mockResolvedValue({ data: [{ id: "self" }, { id: "partner" }], error: null });
    const profileSelect = vi.fn().mockReturnValue({ in: profileIn });
    const from = vi.fn((table: string) => table === "space_members" ? { select: membershipSelect } : { select: profileSelect });

    const result = await listActiveSpaceProfiles({ from } as never, "space-1");
    expect(membershipEqSpace).toHaveBeenCalledWith("space_id", "space-1");
    expect(membershipEqActive).toHaveBeenCalledWith("active", true);
    expect(profileIn).toHaveBeenCalledWith("id", ["self", "partner"]);
    expect(profileSelect).toHaveBeenCalledWith(ACTIVE_SPACE_PROFILE_FIELDS);
    expect(ACTIVE_SPACE_PROFILE_FIELDS).toContain("last_login_at");
    expect(result).not.toContainEqual(expect.objectContaining({ id: "third-space-user" }));
  });
});
