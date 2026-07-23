import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const INTEGRATION_ENVIRONMENT_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "COUPLE_USER_A_EMAIL",
  "COUPLE_USER_A_PASSWORD",
  "COUPLE_USER_B_EMAIL",
  "COUPLE_USER_B_PASSWORD",
] as const;

export type E2eEnvironment = Record<string, string | undefined>;

export function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt < 1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadLocalEnv(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env.local");
  if (!existsSync(envPath)) return;
  const values = parseEnvFile(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
}

export function integrationEnvironmentMissing(environment: E2eEnvironment = process.env): string[] {
  return INTEGRATION_ENVIRONMENT_KEYS.filter((key) => !environment[key]);
}

const BROWSER_CONTEXT_OPTION_KEYS = [
  "acceptDownloads",
  "bypassCSP",
  "colorScheme",
  "deviceScaleFactor",
  "extraHTTPHeaders",
  "geolocation",
  "hasTouch",
  "httpCredentials",
  "ignoreHTTPSErrors",
  "isMobile",
  "javaScriptEnabled",
  "locale",
  "offline",
  "permissions",
  "proxy",
  "reducedMotion",
  "screen",
  "serviceWorkers",
  "timezoneId",
  "userAgent",
  "viewport",
] as const;

export function browserContextOptionsFromProjectUse(projectUse: Record<string, unknown>) {
  return Object.fromEntries(
    BROWSER_CONTEXT_OPTION_KEYS.flatMap((key) => projectUse[key] === undefined ? [] : [[key, projectUse[key]]]),
  );
}

export function isExpectedLoginReadiness(status: number, body: string) {
  return status === 200 && body.includes("NKD DIARY");
}

type LoginReadinessResponse = { status: number; text: () => Promise<string> };

export async function fetchExpectedLoginReadiness(
  fetcher: (url: string, init: { signal: AbortSignal }) => Promise<LoginReadinessResponse>,
  url: string,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    const body = await response.text();
    return isExpectedLoginReadiness(response.status, body);
  } finally {
    clearTimeout(timer);
  }
}

export function hasChildExited(child: { exitCode: number | null; signalCode: string | null }) {
  return child.exitCode !== null || child.signalCode !== null;
}
