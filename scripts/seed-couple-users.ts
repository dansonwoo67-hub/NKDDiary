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
  "COUPLE_USER_A_EMAIL",
  "COUPLE_USER_A_PASSWORD",
  "COUPLE_USER_A_DISPLAY_NAME",
  "COUPLE_USER_B_EMAIL",
  "COUPLE_USER_B_PASSWORD",
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

async function findUserByEmail(email: string) {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    throw error;
  }

  return data.users.find((user) => user.email === email) ?? null;
}

async function ensurePrivateSpace() {
  const relationshipStartedOn = process.env.NEXT_PUBLIC_RELATIONSHIP_START_DATE ?? "2024-01-01";

  const { data: existingSpace, error: existingSpaceError } = await supabase
    .from("spaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingSpaceError) {
    throw existingSpaceError;
  }

  if (existingSpace) {
    return String(existingSpace.id);
  }

  const { data: createdSpace, error: createSpaceError } = await supabase
    .from("spaces")
    .insert({
      site_name: process.env.NEXT_PUBLIC_SITE_NAME ?? "NKD Diary",
      relationship_started_on: relationshipStartedOn,
    })
    .select("id")
    .single();

  if (createSpaceError) {
    throw createSpaceError;
  }

  return String(createdSpace.id);
}

async function upsertUser(email: string, password: string, displayName: string, loginName: string) {
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

async function ensureSpaceMember(spaceId: string, userId: string, role: "owner" | "member") {
  const { error } = await supabase.from("space_members").upsert({
    space_id: spaceId,
    user_id: userId,
    role,
    is_active: true,
  });

  if (error) {
    throw error;
  }
}

async function main() {
  const userAId = await upsertUser(
    process.env.COUPLE_USER_A_EMAIL!,
    process.env.COUPLE_USER_A_PASSWORD!,
    process.env.COUPLE_USER_A_DISPLAY_NAME!,
    "user_a",
  );

  const userBId = await upsertUser(
    process.env.COUPLE_USER_B_EMAIL!,
    process.env.COUPLE_USER_B_PASSWORD!,
    process.env.COUPLE_USER_B_DISPLAY_NAME!,
    "user_b",
  );

  const spaceId = await ensurePrivateSpace();
  await ensureSpaceMember(spaceId, userAId, "owner");
  await ensureSpaceMember(spaceId, userBId, "member");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
