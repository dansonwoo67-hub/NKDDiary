export const MUTATION_OPT_IN = "I_UNDERSTAND_TEST_DATA_WILL_BE_DELETED";

type Environment = Record<string, string | undefined>;

export type MutationE2EConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      supabaseUrl: string;
      publishableKey: string;
      secretKey: string;
      userA: { email: string; password: string };
      userB: { email: string; password: string };
    };

type RequiredMutationSetting =
  | "E2E_TEST_SUPABASE_URL"
  | "E2E_TEST_SUPABASE_PUBLISHABLE_KEY"
  | "E2E_TEST_SUPABASE_SECRET_KEY"
  | "E2E_TEST_USER_A_EMAIL"
  | "E2E_TEST_USER_A_PASSWORD"
  | "E2E_TEST_USER_B_EMAIL"
  | "E2E_TEST_USER_B_PASSWORD"
  | "E2E_APP_SUPABASE_URL";

function required(env: Environment, name: RequiredMutationSetting) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Mutation E2E requires dedicated ${name}.`);
  return value;
}

function normalizeBackendUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`${label} must contain only the backend origin.`);
  }
  return url.origin;
}

export function resolveMutationE2EConfig(env: Environment): MutationE2EConfig {
  if (env.E2E_ALLOW_MUTATIONS !== MUTATION_OPT_IN) {
    return {
      enabled: false,
      reason: "Mutation E2E is disabled unless the destructive test-data opt-in is exact.",
    };
  }

  const supabaseUrl = normalizeBackendUrl(
    required(env, "E2E_TEST_SUPABASE_URL"),
    "E2E_TEST_SUPABASE_URL",
  );
  const appBackendUrl = normalizeBackendUrl(
    required(env, "E2E_APP_SUPABASE_URL"),
    "E2E_APP_SUPABASE_URL",
  );
  if (supabaseUrl !== appBackendUrl) {
    throw new Error("Mutation E2E backend must exactly match the backend used by the started app.");
  }

  return {
    enabled: true,
    supabaseUrl,
    publishableKey: required(env, "E2E_TEST_SUPABASE_PUBLISHABLE_KEY"),
    secretKey: required(env, "E2E_TEST_SUPABASE_SECRET_KEY"),
    userA: {
      email: required(env, "E2E_TEST_USER_A_EMAIL"),
      password: required(env, "E2E_TEST_USER_A_PASSWORD"),
    },
    userB: {
      email: required(env, "E2E_TEST_USER_B_EMAIL"),
      password: required(env, "E2E_TEST_USER_B_PASSWORD"),
    },
  };
}

export function buildAppEnvironment(
  source: Environment,
  config?: Extract<MutationE2EConfig, { enabled: true }>,
) {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (key.startsWith("E2E_") || key.startsWith("COUPLE_USER_")) continue;
    if (
      key === "SUPABASE_SECRET_KEY" ||
      key === "SUPABASE_SERVICE_ROLE_KEY" ||
      key === "SUPABASE_SERVICE_KEY"
    ) {
      continue;
    }
    safe[key] = value;
  }
  if (config) {
    safe.NEXT_PUBLIC_SUPABASE_URL = config.supabaseUrl;
    safe.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = config.publishableKey;
  }
  for (const secretName of [
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "E2E_TEST_SUPABASE_SECRET_KEY",
    "E2E_TEST_USER_A_PASSWORD",
    "E2E_TEST_USER_B_PASSWORD",
    "COUPLE_USER_A_PASSWORD",
    "COUPLE_USER_B_PASSWORD",
  ]) {
    // An explicit empty value prevents Next.js from reloading a real value
    // for the app process from .env.local.
    safe[secretName] = "";
  }
  safe.NEXT_TELEMETRY_DISABLED = "1";
  return safe;
}

export function buildPlaywrightEnvironment(
  source: Environment,
  baseUrl: string,
  config?: Extract<MutationE2EConfig, { enabled: true }>,
) {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (key.startsWith("E2E_") || key.startsWith("COUPLE_USER_")) continue;
    if (
      key === "SUPABASE_SECRET_KEY" ||
      key === "SUPABASE_SERVICE_ROLE_KEY" ||
      key === "SUPABASE_SERVICE_KEY"
    ) {
      continue;
    }
    safe[key] = value;
  }
  safe.PLAYWRIGHT_BASE_URL = baseUrl;
  if (config) {
    safe.E2E_ALLOW_MUTATIONS = MUTATION_OPT_IN;
    safe.E2E_MUTATIONS_SUPERVISED = "1";
    safe.E2E_ACTIVE_SUPABASE_URL = config.supabaseUrl;
    safe.E2E_TEST_USER_A_EMAIL = config.userA.email;
    safe.E2E_TEST_USER_A_PASSWORD = config.userA.password;
    safe.E2E_TEST_USER_B_EMAIL = config.userB.email;
    safe.E2E_TEST_USER_B_PASSWORD = config.userB.password;
  }
  return safe;
}

export function diffCreatedLetterIds(
  before: Array<{ id: string; author_id: string }>,
  after: Array<{ id: string; author_id: string }>,
  allowedAuthorIds: ReadonlySet<string>,
) {
  const beforeIds = new Set(before.map((row) => row.id));
  return after
    .filter((row) => allowedAuthorIds.has(row.author_id) && !beforeIds.has(row.id))
    .map((row) => row.id)
    .sort();
}
