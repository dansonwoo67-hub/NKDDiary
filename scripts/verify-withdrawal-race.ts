import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertWriteCapableE2eEnvironment } from "./e2e-environment-guard";
import { loadE2eEnv } from "./playwright-e2e-config";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  loadE2eEnv();
  const guard = assertWriteCapableE2eEnvironment();
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const author = createClient(url, publishableKey, { auth: { persistSession: false } });
  const recipient = createClient(url, publishableKey, { auth: { persistSession: false } });
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const [authorSession, recipientSession] = await Promise.all([
    author.auth.signInWithPassword({
      email: required("COUPLE_USER_A_EMAIL"),
      password: required("COUPLE_USER_A_PASSWORD"),
    }),
    recipient.auth.signInWithPassword({
      email: required("COUPLE_USER_B_EMAIL"),
      password: required("COUPLE_USER_B_PASSWORD"),
    }),
  ]);
  if (authorSession.error || recipientSession.error) throw new Error("Unable to authenticate E2E couple");
  const authorId = authorSession.data.user.id;
  const recipientId = recipientSession.data.user.id;
  const { data: membership, error: membershipError } = await service
    .from("space_members").select("space_id").eq("user_id", authorId).eq("active", true).single();
  if (membershipError || !membership) throw new Error("Unable to resolve E2E space");

  const entryId = randomUUID();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const { error: insertError } = await service.from("journal_entries").insert({
    id: entryId,
    space_id: membership.space_id,
    author_id: authorId,
    recipient_id: recipientId,
    entry_type: "today",
    title: "",
    content: "e2e_withdraw_race",
    entry_date: today,
    created_local_date: today,
    locked_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: "sent",
  });
  if (insertError) throw insertError;

  try {
    const [withdraw, read] = await Promise.all([
      author.rpc("withdraw_letter_diary", { p_entry_id: entryId }),
      recipient.rpc("mark_letter_read", { p_entry_id: entryId }),
    ]);
    const successCount = Number(!withdraw.error) + Number(!read.error);
    const { data: state, error: stateError } = await service
      .from("journal_entries").select("opened_at,withdrawn_at").eq("id", entryId).single();
    if (stateError || !state) throw stateError ?? new Error("Race state unavailable");
    const exactlyOneState = Boolean(state.opened_at) !== Boolean(state.withdrawn_at);
    if (successCount !== 1 || !exactlyOneState) {
      throw new Error("Concurrent read/withdraw did not resolve to exactly one winner");
    }
    console.log(JSON.stringify({
      environment: "E2E Test",
      projectRef: guard.projectRef,
      production: guard.production,
      successCount,
      exactlyOneState,
      winner: state.withdrawn_at ? "withdraw" : "read",
    }));
  } finally {
    await service.from("notifications").delete().eq("source_id", entryId);
    await service.from("journal_entries").delete().eq("id", entryId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Withdrawal race verification failed");
  process.exitCode = 1;
});
