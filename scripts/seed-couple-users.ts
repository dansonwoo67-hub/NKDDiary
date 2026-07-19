import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

loadLocalEnv();

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "COUPLE_USER_A_DISPLAY_NAME",
  "COUPLE_USER_B_DISPLAY_NAME",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key}`);
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const COUPLE_SPACE_ID = "00000000-0000-4000-8000-000000000001";

async function findUserByEmail(email: string) {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    throw error;
  }

  return data.users.find((user) => user.email === email) ?? null;
}

async function resolveUserId(email: string | undefined, password: string | undefined, suppliedId: string | undefined) {
  if (suppliedId) {
    const { data, error } = await supabase.auth.admin.getUserById(suppliedId);

    if (error || !data.user) {
      throw error ?? new Error(`Cannot find supplied Auth user ${suppliedId}`);
    }

    return data.user.id;
  }

  if (!email || !password) {
    throw new Error("Supply a user ID, or both an email and password, for each couple member");
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { nkd_diary_member: "true" },
  });

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw createError;
  }

  const existing = created.user ? null : await findUserByEmail(email);
  const userId = created.user?.id ?? existing?.id;

  if (!userId) {
    throw new Error(`Cannot find user ${email}`);
  }

  return userId;
}

async function upsertUser(
  email: string | undefined,
  password: string | undefined,
  suppliedId: string | undefined,
  displayName: string,
  loginName: string,
) {
  const userId = await resolveUserId(email, password, suppliedId);

  const { error: metadataError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { nkd_diary_member: "true" },
  });

  if (metadataError) {
    throw metadataError;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    login_name: loginName,
    display_name: displayName,
    relationship_started_on: process.env.NEXT_PUBLIC_RELATIONSHIP_START_DATE ?? "2024-01-01",
  });

  if (profileError) {
    throw profileError;
  }

  return userId;
}

async function upsertSpaceAndMembers(userIds: [string, string]) {
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

async function main() {
  const userAId = await upsertUser(
    process.env.COUPLE_USER_A_EMAIL,
    process.env.COUPLE_USER_A_PASSWORD,
    process.env.COUPLE_USER_A_ID,
    process.env.COUPLE_USER_A_DISPLAY_NAME!,
    "user_a",
  );

  const userBId = await upsertUser(
    process.env.COUPLE_USER_B_EMAIL,
    process.env.COUPLE_USER_B_PASSWORD,
    process.env.COUPLE_USER_B_ID,
    process.env.COUPLE_USER_B_DISPLAY_NAME!,
    "user_b",
  );

  if (userAId === userBId) {
    throw new Error("The couple members must be two different Auth users");
  }

  await upsertSpaceAndMembers([userAId, userBId]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
