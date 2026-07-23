import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import process from "node:process";
import {
  integrationEnvironmentMissing,
  isExpectedLoginReadiness,
  loadLocalEnv,
} from "./playwright-e2e-config";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const playwrightCli = require.resolve("@playwright/test/cli");

const host = "127.0.0.1";

let server: ReturnType<typeof spawn> | undefined;
let serverFailure: Error | undefined;

let isStopping = false;

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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      const response = await fetch(`${baseUrl}/login`, { signal: controller.signal });
      clearTimeout(timeout);

      const body = await response.text();
      if (isExpectedLoginReadiness(response.status, body)) return;
      lastError = new Error(`Unexpected login readiness response: ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError instanceof Error ? lastError : new Error("Dev server did not become ready.");
}

function runPlaywright(baseUrl: string, smokeOnly = false) {
  return new Promise<number>((resolve) => {
    const args = [playwrightCli, "test"];
    if (smokeOnly) args.push("--grep", "unauthenticated smoke");
    const tests = spawn(process.execPath, args, {
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: baseUrl,
      },
      stdio: "inherit",
    });

    tests.on("exit", (code) => resolve(code ?? 1));
    tests.on("error", () => resolve(1));
  });
}

function startServer(port: number) {
  serverFailure = undefined;
  server = spawn(process.execPath, [nextCli, "dev", "--hostname", host, "--port", String(port)], {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
  });
  server.once("error", (error) => { serverFailure = error; });
  server.once("exit", (code, signal) => {
    if (!isStopping) serverFailure = new Error(`Next E2E server exited before completion (${code ?? signal ?? "unknown"})`);
  });
}

async function stopServer() {
  if (isStopping) return;
  isStopping = true;

  if (!server?.pid || server.exitCode !== null) return;

  const exited = new Promise<void>((resolve) => server?.once("exit", () => resolve()));

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
  const exitedInTime = await Promise.race([exited.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000))]);
  if (!exitedInTime && server.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      server.kill("SIGKILL");
    }
    await exited;
  }
}

async function main() {
  let exitCode = 1;
  loadLocalEnv();
  const missingIntegrationEnvironment = integrationEnvironmentMissing();
  const port = await findAvailablePort();
  const baseUrl = `http://${host}:${port}`;

  try {
    startServer(port);
    await waitForServer(baseUrl);
    if (missingIntegrationEnvironment.length) {
      const smokeExitCode = await runPlaywright(baseUrl, true);
      console.error(
        `Task 9 integration journeys are unavailable: missing ${missingIntegrationEnvironment.join(", ")}. `
        + "Smoke ran separately; this full gate is intentionally failing rather than skipping privacy/quota evidence.",
      );
      exitCode = smokeExitCode === 0 ? 1 : smokeExitCode;
    } else {
      exitCode = await runPlaywright(baseUrl);
    }
  } finally {
    await stopServer();
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void stopServer().finally(() => process.exit(130));
});

process.on("SIGTERM", () => {
  void stopServer().finally(() => process.exit(143));
});

void main();
