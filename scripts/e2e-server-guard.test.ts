import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chooseE2EPort,
  monitorServerProcess,
  runWhileServerAlive,
  waitForOwnedServer,
} from "./e2e-server-guard";

class FakeChild extends EventEmitter {}

const children: FakeChild[] = [];

function monitoredChild() {
  const child = new FakeChild();
  children.push(child);
  return { child, monitor: monitorServerProcess(child) };
}

afterEach(() => {
  vi.restoreAllMocks();
  children.length = 0;
});

describe("E2E server ownership guard", () => {
  it("refuses an explicitly requested port already owned by an old service", async () => {
    const oldService = createServer();
    await new Promise<void>((resolve, reject) => {
      oldService.once("error", reject);
      oldService.listen(0, "127.0.0.1", resolve);
    });
    const address = oldService.address();
    if (!address || typeof address === "string") throw new Error("expected a TCP port");

    try {
      await expect(chooseE2EPort("127.0.0.1", String(address.port))).rejects.toThrow(
        /already in use/i,
      );
    } finally {
      await new Promise<void>((resolve) => oldService.close(() => resolve()));
    }
  });

  it("fails immediately when the spawned child exits before readiness", async () => {
    const { child, monitor } = monitoredChild();
    const waiting = waitForOwnedServer({
      baseUrl: "http://127.0.0.1:32123",
      instanceToken: "owned-token",
      expectedBackendUrl: null,
      monitor,
      timeoutMs: 2_000,
      pollIntervalMs: 1,
      fetchImpl: () => new Promise<Response>(() => undefined),
    });

    child.emit("exit", 1, null);

    await expect(waiting).rejects.toThrow(/server exited.*code 1/i);
  });

  it("fails immediately when spawning the server emits an error", async () => {
    const { child, monitor } = monitoredChild();
    const waiting = waitForOwnedServer({
      baseUrl: "http://127.0.0.1:32123",
      instanceToken: "owned-token",
      expectedBackendUrl: null,
      monitor,
      timeoutMs: 2_000,
      fetchImpl: () => new Promise<Response>(() => undefined),
    });

    child.emit("error", new Error("spawn failed"));

    await expect(waiting).rejects.toThrow(/server process failed.*spawn failed/i);
  });

  it.each([
    {
      name: "instance token",
      body: { instanceToken: "old-service-token", backendUrl: "https://test.supabase.co" },
      expected: /instance token mismatch/i,
    },
    {
      name: "backend URL",
      body: { instanceToken: "owned-token", backendUrl: "https://production.supabase.co" },
      expected: /backend URL mismatch/i,
    },
  ])("rejects a responding service with a mismatched $name", async ({ body, expected }) => {
    const { monitor } = monitoredChild();
    await expect(
      waitForOwnedServer({
        baseUrl: "http://127.0.0.1:32123",
        instanceToken: "owned-token",
        expectedBackendUrl: "https://test.supabase.co",
        monitor,
        timeoutMs: 20,
        pollIntervalMs: 1,
        fetchImpl: async () => Response.json(body),
      }),
    ).rejects.toThrow(expected);
  });

  it("accepts only the matching token and backend from the spawned server", async () => {
    const { monitor } = monitoredChild();
    await expect(
      waitForOwnedServer({
        baseUrl: "http://127.0.0.1:32123",
        instanceToken: "owned-token",
        expectedBackendUrl: "https://test.supabase.co",
        monitor,
        fetchImpl: async () =>
          Response.json({
            instanceToken: "owned-token",
            backendUrl: "https://test.supabase.co",
          }),
      }),
    ).resolves.toBeUndefined();
  });

  it("fails the guarded task if the server exits after readiness", async () => {
    const { child, monitor } = monitoredChild();
    const guarded = runWhileServerAlive(
      new Promise<number>((resolve) => setTimeout(() => resolve(0), 2_000)),
      monitor,
    );

    child.emit("exit", 2, null);

    await expect(guarded).rejects.toThrow(/server exited.*code 2/i);
  });
});
