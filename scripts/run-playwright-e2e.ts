import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import process from "node:process";
import {
  fetchExpectedLoginReadiness,
  hasChildExited,
  loadE2eEnv,
  planTreeTermination,
} from "./playwright-e2e-config";
import { assertWriteCapableE2eEnvironment } from "./e2e-environment-guard";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const playwrightCli = require.resolve("@playwright/test/cli");

const host = "127.0.0.1";

type Child = ReturnType<typeof spawn>;
type ChildOutcome = { code: number | null; signal: string | null; error?: Error };
type TrackedChild = { child: Child; exited: Promise<ChildOutcome> };

let server: TrackedChild | undefined;
let playwright: TrackedChild | undefined;
let serverFailure: Error | undefined;
let stopping: Promise<void> | undefined;
let requestedSignalExitCode: 130 | 143 | undefined;

async function findAvailablePort(preferredPort = process.env.PLAYWRIGHT_E2E_PORT) {
  const port = preferredPort ? Number(preferredPort) : 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PLAYWRIGHT_E2E_PORT must be a valid TCP port");
  }
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, host, () => resolve());
  });
  const address = probe.address();
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Unable to reserve an E2E port");
  return address.port;
}

async function waitForServer(baseUrl: string, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    if (serverFailure) throw serverFailure;
    try {
      const ready = await fetchExpectedLoginReadiness(
        (url, init) => fetch(url, init),
        `${baseUrl}/login`,
        2_000,
      );
      if (ready) return;
      lastError = new Error("Unexpected login readiness response");
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError instanceof Error ? lastError : new Error("Dev server did not become ready.");
}

function trackChild(child: Child): TrackedChild {
  let resolveExit: (outcome: ChildOutcome) => void;
  const exited = new Promise<ChildOutcome>((resolve) => { resolveExit = resolve; });
  child.once("exit", (code, signal) => resolveExit!({ code, signal }));
  child.once("error", (error) => resolveExit!({ code: child.exitCode, signal: child.signalCode, error }));
  return { child, exited };
}

async function runPlaywright(baseUrl: string, smokeOnly = false) {
  const args = [playwrightCli, "test"];
  if (smokeOnly) args.push("--grep", "unauthenticated smoke");
  playwright = trackChild(spawn(process.execPath, args, {
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseUrl,
    },
    stdio: "inherit",
    detached: process.platform !== "win32",
  }));
  const outcome = await playwright.exited;
  return outcome.error ? 1 : outcome.code ?? 1;
}

function startServer(port: number) {
  serverFailure = undefined;
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", host, "--port", String(port)], {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  server = trackChild(child);
  void server.exited.then((outcome) => {
    if (!stopping) {
      serverFailure = outcome.error ?? new Error(
        `Next E2E server exited before completion (${outcome.code ?? outcome.signal ?? "unknown"})`,
      );
    }
  });
}

async function waitBounded<T>(promise: Promise<T>, timeoutMs = 5_000) {
  return Promise.race([promise.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))]);
}

async function runTaskkill(args: string[], timeoutMs: number) {
  await new Promise<void>((resolve) => {
    const command = spawn("taskkill", args, { stdio: "ignore", windowsHide: true });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try { command.kill(); } catch { /* bounded best effort */ }
      finish();
    }, timeoutMs);
    command.once("error", finish);
    command.once("exit", finish);
  });
}

async function executeTermination(plan: ReturnType<typeof planTreeTermination>) {
  if (plan.kind === "none") return;
  if (plan.kind === "windows-taskkill") {
    await runTaskkill(plan.args, plan.timeoutMs);
    return;
  }
  try {
    process.kill(plan.pid, plan.signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      // The bounded wait below determines whether a surviving child needs forcing.
    }
  }
}

async function terminateChild(tracked: TrackedChild | undefined) {
  if (!tracked || hasChildExited(tracked.child)) return;
  await executeTermination(planTreeTermination(process.platform, tracked.child.pid, false, hasChildExited(tracked.child)));
  if (await waitBounded(tracked.exited)) return;
  await executeTermination(planTreeTermination(process.platform, tracked.child.pid, true, hasChildExited(tracked.child)));
  await waitBounded(tracked.exited);
}

function stopProcesses() {
  stopping ??= Promise.all([terminateChild(playwright), terminateChild(server)]).then(() => undefined);
  return stopping;
}

async function main() {
  let exitCode = 1;
  loadE2eEnv();
  const guard = assertWriteCapableE2eEnvironment();
  console.log(`Environment: E2E Test\nSupabase Project Ref: ${guard.projectRef}\nProduction: ${guard.production}`);
  const port = await findAvailablePort();
  const baseUrl = `http://${host}:${port}`;

  try {
    startServer(port);
    await waitForServer(baseUrl);
    exitCode = await runPlaywright(baseUrl);
  } finally {
    await stopProcesses();
  }

  process.exit(requestedSignalExitCode ?? exitCode);
}

function requestSignalExit(code: 130 | 143) {
  requestedSignalExitCode ??= code;
  void stopProcesses().finally(() => process.exit(requestedSignalExitCode ?? code));
}

process.on("SIGINT", () => requestSignalExit(130));
process.on("SIGTERM", () => requestSignalExit(143));

void main();
