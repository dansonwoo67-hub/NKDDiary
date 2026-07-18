import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "./proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateSession", () => {
  it("lets the private E2E health route reach its own token guard", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    const response = await updateSession(
      new NextRequest("http://127.0.0.1:3000/api/e2e-health"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
