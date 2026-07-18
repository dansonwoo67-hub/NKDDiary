import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildAppEnvironment,
  buildPlaywrightEnvironment,
  diffCreatedLetterIds,
  MUTATION_OPT_IN,
  resolveMutationE2EConfig,
  type MutationE2EConfig,
} from "./e2e-mutation-safety";
import {
  chooseE2EPort,
  monitorServerProcess,
  runWhileServerAlive,
  waitForOwnedServer,
  type ServerProcessMonitor,
} from "./e2e-server-guard";
import { E2ERunLifecycle } from "./e2e-run-lifecycle";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const playwrightCli = require.resolve("@playwright/test/cli");

const host = "127.0.0.1";

type LetterRow = { id: string; author_id: string };
type CleanupSnapshot = {
  client: SupabaseClient;
  authorIds: Set<string>;
  before: LetterRow[];
};

function mutationConfigFromEnvironment(): MutationE2EConfig {
  const environment = { ...process.env };
  if (environment.E2E_ALLOW_MUTATIONS === MUTATION_OPT_IN) {
    environment.E2E_APP_SUPABASE_URL = environment.E2E_TEST_SUPABASE_URL;
  }
  return resolveMutationE2EConfig(environment);
}

function startServer(environment: Record<string, string>, port: number): ServerProcessMonitor {
  lifecycle.assertCanSpawn();
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", host, "--port", String(port)], {
    env: environment as NodeJS.ProcessEnv,
    stdio: "inherit",
  });
  const monitor = monitorServerProcess(child);
  lifecycle.assignServer(child);
  return monitor;
}

function runPlaywright(environment: Record<string, string>) {
  lifecycle.assertCanSpawn();
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [playwrightCli, "test"], {
      env: environment as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
    lifecycle.assignTests(child);

    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function stopProcess(child: ChildProcess | null) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

const lifecycle = new E2ERunLifecycle<ChildProcess>(stopProcess);

async function findTestAuthorIds(
  client: SupabaseClient,
  config: Extract<MutationE2EConfig, { enabled: true }>,
) {
  const wanted = new Set([config.userA.email.toLowerCase(), config.userB.email.toLowerCase()]);
  const ids = new Set<string>();
  const perPage = 1_000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list dedicated E2E users: ${error.message}`);
    for (const user of data.users) {
      if (user.email && wanted.has(user.email.toLowerCase())) ids.add(user.id);
    }
    if (ids.size === wanted.size) return ids;
    if (data.users.length < perPage) break;
  }

  throw new Error("Dedicated E2E users were not both found in the test backend.");
}

async function readLetters(client: SupabaseClient, authorIds: ReadonlySet<string>) {
  const { data, error } = await client
    .from("letters")
    .select("id, author_id")
    .in("author_id", [...authorIds]);
  if (error) throw new Error(`Could not snapshot E2E letters: ${error.message}`);
  return (data ?? []) as LetterRow[];
}

async function captureCleanupSnapshot(
  config: Extract<MutationE2EConfig, { enabled: true }>,
): Promise<CleanupSnapshot> {
  const client = createClient(config.supabaseUrl, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const authorIds = await findTestAuthorIds(client, config);
  const before = await readLetters(client, authorIds);
  return { client, authorIds, before };
}

async function cleanupCreatedLetters(snapshot: CleanupSnapshot) {
  const after = await readLetters(snapshot.client, snapshot.authorIds);
  const createdIds = diffCreatedLetterIds(snapshot.before, after, snapshot.authorIds);
  if (createdIds.length === 0) return;

  const { data: assets, error: assetError } = await snapshot.client
    .from("letter_assets")
    .select("id, letter_id")
    .in("letter_id", createdIds);
  if (assetError) throw new Error(`Could not verify E2E letter assets: ${assetError.message}`);
  if ((assets ?? []).length > 0) {
    throw new Error("Refusing E2E cleanup because a newly created letter has image assets.");
  }

  const { data: deleted, error: deleteError } = await snapshot.client
    .from("letters")
    .delete()
    .in("id", createdIds)
    .in("author_id", [...snapshot.authorIds])
    .select("id");
  if (deleteError) throw new Error(`Could not clean up E2E letters: ${deleteError.message}`);
  const deletedIds = new Set((deleted ?? []).map((row) => String(row.id)));
  if (createdIds.some((id) => !deletedIds.has(id))) {
    throw new Error("E2E cleanup did not delete every letter created by this run.");
  }

  const { data: remaining, error: verifyError } = await snapshot.client
    .from("letters")
    .select("id")
    .in("id", createdIds);
  if (verifyError) throw new Error(`Could not verify E2E cleanup: ${verifyError.message}`);
  if ((remaining ?? []).length > 0) throw new Error("E2E cleanup verification found remaining letters.");
}

async function main() {
  let exitCode = 1;
  let cleanupSnapshot: CleanupSnapshot | null = null;
  let config: MutationE2EConfig = { enabled: false, reason: "Mutation E2E configuration was not read." };

  try {
    config = mutationConfigFromEnvironment();
    lifecycle.assertCanSpawn();
    if (config.enabled) {
      cleanupSnapshot = await lifecycle.checkpoint(captureCleanupSnapshot(config));
    }
    const port = await lifecycle.checkpoint(chooseE2EPort(host, process.env.PORT));
    const baseUrl = `http://${host}:${port}`;
    const instanceToken = randomUUID();
    const appEnvironment = buildAppEnvironment(
      process.env,
      config.enabled ? config : undefined,
    );
    const expectedBackendUrl = appEnvironment.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
    appEnvironment.E2E_INSTANCE_TOKEN = instanceToken;
    const serverMonitor = startServer(appEnvironment, port);
    await lifecycle.checkpoint(
      waitForOwnedServer({
        baseUrl,
        instanceToken,
        expectedBackendUrl,
        monitor: serverMonitor,
      }),
    );
    exitCode = await lifecycle.checkpoint(
      runWhileServerAlive(
        runPlaywright(
          buildPlaywrightEnvironment(process.env, baseUrl, config.enabled ? config : undefined),
        ),
        serverMonitor,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "E2E runner failed.");
    exitCode = 1;
  } finally {
    if (cleanupSnapshot) {
      try {
        await cleanupCreatedLetters(cleanupSnapshot);
      } catch (error) {
        console.error(error instanceof Error ? error.message : "E2E cleanup failed.");
        exitCode = 1;
      }
    }
    lifecycle.stopChildren();
  }

  process.exitCode = exitCode;
}

process.once("SIGINT", () => lifecycle.requestAbort());
process.once("SIGTERM", () => lifecycle.requestAbort());

void main();
