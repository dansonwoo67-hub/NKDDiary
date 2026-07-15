import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DetachedAssetCleanup } from "./DetachedAssetCleanup";

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

describe("DetachedAssetCleanup", () => {
  it("runs silently after render and only once per browser session", async () => {
    const runCleanup = vi.fn(async () => ({ ok: true }));
    const { container } = render(
      <>
        <DetachedAssetCleanup userId="user-a" runCleanup={runCleanup} />
        <DetachedAssetCleanup userId="user-a" runCleanup={runCleanup} />
      </>,
    );

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(runCleanup).toHaveBeenCalledOnce());
  });

  it("is mounted in the authenticated app shell", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "src/app/(app)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("<DetachedAssetCleanup userId={userId} />");
  });

  it("deduplicates per user instead of across both accounts", async () => {
    const runCleanup = vi.fn(async () => ({ ok: true }));
    render(
      <>
        <DetachedAssetCleanup userId="user-a" runCleanup={runCleanup} />
        <DetachedAssetCleanup userId="user-b" runCleanup={runCleanup} />
      </>,
    );
    await waitFor(() => expect(runCleanup).toHaveBeenCalledTimes(2));
    expect(window.sessionStorage.getItem("nkd:detached-letter-assets-cleaned:v1:user-a")).toBe("1");
    expect(window.sessionStorage.getItem("nkd:detached-letter-assets-cleaned:v1:user-b")).toBe("1");
  });

  it("does not mark a failed cleanup complete so a later mount can retry", async () => {
    const runCleanup = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const first = render(
      <DetachedAssetCleanup userId="user-a" runCleanup={runCleanup} />,
    );
    await waitFor(() => expect(runCleanup).toHaveBeenCalledOnce());
    expect(window.sessionStorage.getItem("nkd:detached-letter-assets-cleaned:v1:user-a")).toBeNull();
    first.unmount();

    render(<DetachedAssetCleanup userId="user-a" runCleanup={runCleanup} />);
    await waitFor(() => expect(runCleanup).toHaveBeenCalledTimes(2));
  });
});
