export const BATCH2_E2E_PROJECT_REF = "dhznooibxcnpioqwnicy" as const;

const REFUSAL_MESSAGE = "Refusing to run write-capable E2E against production Supabase.";

const REQUIRED_E2E_KEYS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "COUPLE_USER_A_EMAIL",
  "COUPLE_USER_A_PASSWORD",
  "COUPLE_USER_B_EMAIL",
  "COUPLE_USER_B_PASSWORD",
] as const;

export type WriteCapableE2eEnvironment = Record<string, string | undefined>;
export type WriteCapableE2eGuardResult = {
  projectRef: typeof BATCH2_E2E_PROJECT_REF;
  production: false;
};

export function parseSupabaseProjectRef(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.port || parsed.pathname !== "/") return null;
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(parsed.hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function refuse(reason: string): never {
  throw new Error(`${REFUSAL_MESSAGE} ${reason}`);
}

export function assertWriteCapableE2eEnvironment(
  environment: WriteCapableE2eEnvironment = process.env,
): WriteCapableE2eGuardResult {
  if (environment.E2E_TEST_ENV !== "true") refuse("E2E_TEST_ENV must be true.");

  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = url ? parseSupabaseProjectRef(url) : null;
  if (!projectRef) refuse("The Supabase project URL is missing or invalid.");

  const allowedRef = environment.E2E_ALLOWED_SUPABASE_PROJECT_REF;
  const productionRef = environment.PRODUCTION_SUPABASE_PROJECT_REF;
  if (!allowedRef || !productionRef) refuse("The project allowlist and Production denylist are required.");
  if (allowedRef === productionRef) refuse("The project allowlist conflicts with the Production denylist.");
  if (projectRef === productionRef) refuse("The configured URL resolves to the Production project.");
  if (allowedRef !== BATCH2_E2E_PROJECT_REF || projectRef !== allowedRef) {
    refuse("The configured project is not the approved isolated E2E project.");
  }

  const missing = REQUIRED_E2E_KEYS.filter((key) => !environment[key]);
  if (missing.length) refuse(`Missing required E2E variables: ${missing.join(", ")}.`);

  return { projectRef: BATCH2_E2E_PROJECT_REF, production: false };
}
