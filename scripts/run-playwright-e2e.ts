import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { integrationEnvironmentMissing, loadLocalEnv } from "./playwright-e2e-config";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const playwrightCli = require.resolve("@playwright/test/cli");

const host = "127.0.0.1";
const port = process.env.PORT ?? "3000";
const baseUrl = `http://${host}:${port}`;

let server: ReturnType<typeof spawn> | undefined;

let isStopping = false;

async function waitForServer(timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      const response = await fetch(`${baseUrl}/login`, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok || response.status < 500) return;
      lastError = new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError instanceof Error ? lastError : new Error("Dev server did not become ready.");
}

function runPlaywright(smokeOnly = false) {
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

function startServer() {
  server = spawn(process.execPath, [nextCli, "dev", "--hostname", host, "--port", port], {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
  });
}

function stopServer() {
  if (isStopping) return;
  isStopping = true;

  if (!server?.pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  server.kill("SIGTERM");
}

async function main() {
  let exitCode = 1;
  loadLocalEnv();
  const missingIntegrationEnvironment = integrationEnvironmentMissing();

  try {
    startServer();
    await waitForServer();
    if (missingIntegrationEnvironment.length) {
      const smokeExitCode = await runPlaywright(true);
      console.error(
        `Task 9 integration journeys are unavailable: missing ${missingIntegrationEnvironment.join(", ")}. `
        + "Smoke ran separately; this full gate is intentionally failing rather than skipping privacy/quota evidence.",
      );
      exitCode = smokeExitCode === 0 ? 1 : smokeExitCode;
    } else {
      exitCode = await runPlaywright();
    }
  } finally {
    stopServer();
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => {
  stopServer();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopServer();
  process.exit(143);
});

void main();
