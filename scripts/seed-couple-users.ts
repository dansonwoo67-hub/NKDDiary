import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  assertWriteCapableE2eEnvironment,
  type WriteCapableE2eEnvironment,
} from "./e2e-environment-guard";
import { loadE2eEnv } from "./playwright-e2e-config";

const COUPLE_SPACE_ID = "00000000-0000-4000-8000-000000000001";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateSeedEnvironment(environment: WriteCapableE2eEnvironment = process.env) {
  return assertWriteCapableE2eEnvironment(environment);
}

export function validateSeedUserIds(userAId: string | undefined, userBId: string | undefined) {
  if (!userAId || !UUID_PATTERN.test(userAId)) {
    throw new Error("COUPLE_USER_A_ID must be a UUID");
  }

  if (!userBId || !UUID_PATTERN.test(userBId)) {
    throw new Error("COUPLE_USER_B_ID must be a UUID");
  }

  const normalizedUserAId = userAId.toLowerCase();
  const normalizedUserBId = userBId.toLowerCase();

  if (normalizedUserAId === normalizedUserBId) {
    throw new Error("COUPLE_USER_A_ID and COUPLE_USER_B_ID must be distinct");
  }

  return [normalizedUserAId, normalizedUserBId] as const;
}

export function validateSyntheticE2eEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email || !email.includes("e2e") || !email.endsWith("@example.test")) {
    throw new Error("E2E account email must be a synthetic E2E address under example.test");
  }
  return email;
}

function requireEnvironmentValue(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing ${key}`);
  }

  return value;
}

async function findUserByEmail(client: SupabaseClient, email: string): Promise<User | undefined> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 100) return undefined;
  }
  throw new Error("E2E Auth user lookup exceeded its bounded page limit");
}

async function ensureSyntheticUser(client: SupabaseClient, email: string, password: string) {
  const existing = await findUserByEmail(client, email);
  if (existing) {
    const { data, error } = await client.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: { ...existing.app_metadata, nkd_diary_member: "true", e2e_fixture: true },
    });
    if (error || !data.user) throw error ?? new Error("Unable to refresh E2E Auth user");
    return data.user;
  }
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { nkd_diary_member: "true", e2e_fixture: true },
  });
  if (error || !data.user) throw error ?? new Error("Unable to create E2E Auth user");
  return data.user;
}

async function main() {
  loadE2eEnv();
  const guard = validateSeedEnvironment();

  const supabaseUrl = requireEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");
  const emails = [
    validateSyntheticE2eEmail(process.env.COUPLE_USER_A_EMAIL),
    validateSyntheticE2eEmail(process.env.COUPLE_USER_B_EMAIL),
  ] as const;
  const passwords = [
    requireEnvironmentValue("COUPLE_USER_A_PASSWORD"),
    requireEnvironmentValue("COUPLE_USER_B_PASSWORD"),
  ] as const;
  const displayNames = [
    requireEnvironmentValue("COUPLE_USER_A_DISPLAY_NAME"),
    requireEnvironmentValue("COUPLE_USER_B_DISPLAY_NAME"),
  ] as const;

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log(`Environment: E2E Test\nSupabase Project Ref: ${guard.projectRef}\nProduction: ${guard.production}`);

  const authUsers = await Promise.all(
    emails.map((email, index) => ensureSyntheticUser(supabase, email, passwords[index])),
  );
  const userIds = authUsers.map((user) => user.id);

  for (const [index, user] of authUsers.entries()) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      login_name: index === 0 ? "user_a" : "user_b",
      display_name: displayNames[index],
      relationship_started_on:
        process.env.NEXT_PUBLIC_RELATIONSHIP_START_DATE ?? "2024-01-01",
    });

    if (profileError) {
      throw profileError;
    }
  }

  const { error: spaceError } = await supabase.from("spaces").upsert({
    id: COUPLE_SPACE_ID,
    name: "Couple Diary",
    timezone: "Asia/Shanghai",
  });

  if (spaceError) {
    throw spaceError;
  }

  const { error: membershipError } = await supabase.from("space_members").upsert(
    userIds.map((userId) => ({
      space_id: COUPLE_SPACE_ID,
      user_id: userId,
      active: true,
    })),
    { onConflict: "space_id,user_id" },
  );

  if (membershipError) {
    throw membershipError;
  }
  console.log(`E2E fixture ready: 2 synthetic users and 1 space in ${guard.projectRef}.`);
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
