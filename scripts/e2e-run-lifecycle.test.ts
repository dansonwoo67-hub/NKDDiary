import { describe, expect, it, vi } from "vitest";

import { E2ERunLifecycle } from "./e2e-run-lifecycle";

type FakeChild = { name: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("E2E run lifecycle", () => {
  it("does not spawn after an abort requested during the snapshot await", async () => {
    const lifecycle = new E2ERunLifecycle<FakeChild>(vi.fn());
    const snapshot = deferred<string>();
    let spawned = false;
    const workflow = (async () => {
      await lifecycle.checkpoint(snapshot.promise);
      lifecycle.assertCanSpawn();
      spawned = true;
    })();

    lifecycle.requestAbort();
    snapshot.resolve("snapshot");

    await expect(workflow).rejects.toThrow(/aborted/i);
    expect(spawned).toBe(false);
  });

  it("immediately stops a child assigned after the abort raced with spawn", () => {
    const stop = vi.fn();
    const lifecycle = new E2ERunLifecycle<FakeChild>(stop);
    const lateServer = { name: "late server" };

    lifecycle.requestAbort();
    lifecycle.assignServer(lateServer);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(lateServer);
  });

  it("a later final stop still checks and stops children assigned after an earlier stop", () => {
    const stop = vi.fn();
    const lifecycle = new E2ERunLifecycle<FakeChild>(stop);
    lifecycle.stopChildren();
    const lateServer = { name: "late server" };
    const lateTests = { name: "late tests" };

    lifecycle.assignServer(lateServer);
    lifecycle.assignTests(lateTests);
    lifecycle.stopChildren();

    expect(stop).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledWith(lateServer);
    expect(stop).toHaveBeenCalledWith(lateTests);
  });
});
