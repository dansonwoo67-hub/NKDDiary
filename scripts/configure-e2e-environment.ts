import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { BATCH2_E2E_PROJECT_REF, parseSupabaseProjectRef } from "./e2e-environment-guard";
import { parseEnvFile } from "./playwright-e2e-config";

type ApiKeyRecord = {
  name: string;
  type: string;
  api_key: string;
  disabled?: boolean | null;
};

export function selectE2eApiKeys(keys: ApiKeyRecord[]) {
  const publishable = keys.find((key) => key.type === "publishable" && !key.disabled);
  const serviceRole = keys.find((key) => key.name === "service_role" && !key.disabled);
  if (!publishable?.api_key || !serviceRole?.api_key) {
    throw new Error("Active E2E publishable and service-role keys are required");
  }
  return { publishableKey: publishable.api_key, serviceRoleKey: serviceRole.api_key };
}

export function planSupabaseCliInvocation(
  platform: NodeJS.Platform,
  commandProcessor: string | undefined,
  args: string[],
) {
  if (platform === "win32") {
    if (!commandProcessor) throw new Error("Windows command processor is unavailable");
    return {
      command: commandProcessor,
      args: ["/d", "/s", "/c", "npx", "supabase@latest", ...args],
    };
  }
  return { command: "npx", args: ["supabase@latest", ...args] };
}

function readTestProjectKeys() {
  const invocation = planSupabaseCliInvocation(process.platform, process.env.ComSpec, [
    "projects",
    "api-keys",
    "--project-ref",
    BATCH2_E2E_PROJECT_REF,
    "--output",
    "json",
    "--agent",
    "no",
  ]);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("Unable to read isolated E2E project API keys");
  return selectE2eApiKeys(JSON.parse(result.stdout) as ApiKeyRecord[]);
}

function quote(value: string) {
  return JSON.stringify(value);
}

function main() {
  const cwd = process.cwd();
  const linkedRef = readFileSync(path.join(cwd, "supabase", ".temp", "project-ref"), "utf8").trim();
  if (linkedRef !== BATCH2_E2E_PROJECT_REF) throw new Error("Supabase CLI is not linked to the approved E2E project");

  const localEnvironment = parseEnvFile(readFileSync(path.join(cwd, ".env.local"), "utf8"));
  const productionRef = parseSupabaseProjectRef(localEnvironment.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!productionRef || productionRef === BATCH2_E2E_PROJECT_REF) {
    throw new Error("A distinct Production project ref is required for the E2E denylist");
  }

  const { publishableKey, serviceRoleKey } = readTestProjectKeys();
  const passwordA = randomBytes(24).toString("base64url");
  const passwordB = randomBytes(24).toString("base64url");
  const suffix = BATCH2_E2E_PROJECT_REF.slice(0, 8);
  const values = {
    E2E_TEST_ENV: "true",
    E2E_ALLOWED_SUPABASE_PROJECT_REF: BATCH2_E2E_PROJECT_REF,
    PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${BATCH2_E2E_PROJECT_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    COUPLE_USER_A_EMAIL: `susan-e2e-${suffix}@example.test`,
    COUPLE_USER_A_PASSWORD: passwordA,
    COUPLE_USER_A_DISPLAY_NAME: "Susan E2E",
    COUPLE_USER_B_EMAIL: `niki-e2e-${suffix}@example.test`,
    COUPLE_USER_B_PASSWORD: passwordB,
    COUPLE_USER_B_DISPLAY_NAME: "Niki E2E",
    NEXT_PUBLIC_RELATIONSHIP_START_DATE: "2024-01-01",
  };
  const contents = Object.entries(values).map(([key, value]) => `${key}=${quote(value)}`).join("\n") + "\n";
  writeFileSync(path.join(cwd, ".env.e2e.local"), contents, { encoding: "utf8", mode: 0o600 });
  console.log(`E2E environment prepared for project ${BATCH2_E2E_PROJECT_REF}. No credentials were printed.`);
}

const isDirectExecution = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main();
