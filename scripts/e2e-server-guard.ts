import { createServer } from "node:net";

type ServerProcessLike = {
  once(event: "error", listener: (error: Error) => void): unknown;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
};

export type ServerProcessMonitor = {
  failure: Promise<Error>;
  getFailure: () => Error | null;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function parseRequestedPort(value: string) {
  if (!/^\d+$/.test(value)) throw new Error("PORT must be an integer between 1 and 65535.");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function probePort(host: string, port: number) {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen({ host, port, exclusive: true }, () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not determine the allocated E2E port."));
        return;
      }
      const allocatedPort = address.port;
      probe.close((error) => {
        if (error) reject(error);
        else resolve(allocatedPort);
      });
    });
  });
}

export async function chooseE2EPort(host: string, requestedPort?: string) {
  if (!requestedPort) return probePort(host, 0);
  const port = parseRequestedPort(requestedPort);
  try {
    return await probePort(host, port);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`Requested E2E PORT ${port} is already in use or unavailable${detail}`);
  }
}

export function monitorServerProcess(child: ServerProcessLike): ServerProcessMonitor {
  let failure: Error | null = null;
  let resolveFailure!: (error: Error) => void;
  const failurePromise = new Promise<Error>((resolve) => {
    resolveFailure = resolve;
  });

  const recordFailure = (error: Error) => {
    if (failure) return;
    failure = error;
    resolveFailure(error);
  };

  child.once("error", (error) => {
    recordFailure(new Error(`E2E Next server process failed: ${error.message}`));
  });
  child.once("exit", (code, signal) => {
    const status = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
    recordFailure(new Error(`E2E Next server exited with ${status}.`));
  });

  return {
    failure: failurePromise,
    getFailure: () => failure,
  };
}

async function pauseOrThrow(milliseconds: number, monitor: ServerProcessMonitor) {
  const existingFailure = monitor.getFailure();
  if (existingFailure) throw existingFailure;
  const outcome = await Promise.race([
    new Promise<null>((resolve) => setTimeout(() => resolve(null), milliseconds)),
    monitor.failure,
  ]);
  if (outcome instanceof Error) throw outcome;
}

export async function waitForOwnedServer({
  baseUrl,
  instanceToken,
  expectedBackendUrl,
  monitor,
  fetchImpl = fetch,
  timeoutMs = 60_000,
  pollIntervalMs = 250,
}: {
  baseUrl: string;
  instanceToken: string;
  expectedBackendUrl: string | null;
  monitor: ServerProcessMonitor;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  pollIntervalMs?: number;
}) {
  const startedAt = Date.now();
  let lastError: Error = new Error("E2E Next server did not become ready.");

  while (Date.now() - startedAt < timeoutMs) {
    const existingFailure = monitor.getFailure();
    if (existingFailure) throw existingFailure;

    const controller = new AbortController();
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const requestTimeoutMs = Math.max(1, Math.min(2_000, timeoutMs - (Date.now() - startedAt)));
      const outcome = await Promise.race([
        fetchImpl(`${baseUrl}/api/e2e-health`, {
          cache: "no-store",
          signal: controller.signal,
        }).then(
          (response) => ({ type: "response" as const, response }),
          (error: unknown) => ({ type: "request-error" as const, error }),
        ),
        monitor.failure.then((error) => ({ type: "server-error" as const, error })),
        new Promise<{ type: "timeout" }>((resolve) => {
          requestTimer = setTimeout(() => {
            controller.abort();
            resolve({ type: "timeout" });
          }, requestTimeoutMs);
        }),
      ]);

      if (outcome.type === "server-error") throw outcome.error;
      if (outcome.type === "timeout") {
        lastError = new Error("Timed out checking the owned E2E server health route.");
      } else if (outcome.type === "request-error") {
        lastError = outcome.error instanceof Error ? outcome.error : new Error("E2E health request failed.");
      } else if (!outcome.response.ok) {
        lastError = new Error(`E2E health route returned ${outcome.response.status}.`);
      } else {
        const body = (await outcome.response.json()) as {
          instanceToken?: unknown;
          backendUrl?: unknown;
        };
        if (body.instanceToken !== instanceToken) {
          lastError = new Error("E2E server instance token mismatch.");
        } else if (body.backendUrl !== expectedBackendUrl) {
          lastError = new Error("E2E server backend URL mismatch.");
        } else {
          return;
        }
      }
    } catch (error) {
      if (monitor.getFailure()) throw monitor.getFailure();
      lastError = error instanceof Error ? error : new Error("E2E server readiness check failed.");
    } finally {
      if (requestTimer) clearTimeout(requestTimer);
      controller.abort();
    }

    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining > 0) await pauseOrThrow(Math.min(pollIntervalMs, remaining), monitor);
  }

  throw lastError;
}

export async function runWhileServerAlive<T>(
  task: Promise<T>,
  monitor: ServerProcessMonitor,
): Promise<T> {
  const existingFailure = monitor.getFailure();
  if (existingFailure) throw existingFailure;

  const outcome = await Promise.race([
    task.then(
      (value) => ({ type: "task" as const, value }),
      (error: unknown) => ({ type: "task-error" as const, error }),
    ),
    monitor.failure.then((error) => ({ type: "server-error" as const, error })),
  ]);

  if (outcome.type === "server-error") throw outcome.error;
  if (outcome.type === "task-error") throw outcome.error;
  const finalFailure = monitor.getFailure();
  if (finalFailure) throw finalFailure;
  return outcome.value;
}
