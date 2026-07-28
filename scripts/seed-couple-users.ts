import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const COUPLE_SPACE_ID = "00000000-0000-4000-8000-000000000001";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
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

function requireEnvironmentValue(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing ${key}`);
  }

  return value;
}

async function main() {
  loadLocalEnv();

  const userIds = validateSeedUserIds(
    process.env.COUPLE_USER_A_ID,
    process.env.COUPLE_USER_B_ID,
  );
  const supabaseUrl = requireEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnvironmentValue("SUPABASE_SECRET_KEY");
  const displayNames = [
    requireEnvironmentValue("COUPLE_USER_A_DISPLAY_NAME"),
    requireEnvironmentValue("COUPLE_USER_B_DISPLAY_NAME"),
  ] as const;

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authUsers = await Promise.all(
    userIds.map(async (userId) => {
      const { data, error } = await supabase.auth.admin.getUserById(userId);

      if (error || !data.user) {
        throw error ?? new Error(`Cannot find pre-created Auth user ${userId}`);
      }

      return data.user;
    }),
  );

  for (const [index, user] of authUsers.entries()) {
    const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { nkd_diary_member: "true" },
    });

    if (metadataError) {
      throw metadataError;
    }

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
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
