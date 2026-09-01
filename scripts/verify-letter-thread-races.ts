import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertWriteCapableE2eEnvironment } from "./e2e-environment-guard";
import { loadE2eEnv } from "./playwright-e2e-config";

loadE2eEnv();
const guard = assertWriteCapableE2eEnvironment();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const marker = `thread_race_${Date.now()}`;

async function signedIn(email: string, password: string) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("race user login failed");
  return { client, userId: data.user.id };
}

async function main() {
const a = await signedIn(process.env.COUPLE_USER_A_EMAIL!, process.env.COUPLE_USER_A_PASSWORD!);
const b = await signedIn(process.env.COUPLE_USER_B_EMAIL!, process.env.COUPLE_USER_B_PASSWORD!);
const { data: membership, error: membershipError } = await service.from("space_members")
  .select("space_id").eq("user_id", a.userId).eq("active", true).single();
if (membershipError || !membership) throw membershipError ?? new Error("race space unavailable");
const spaceId = String(membership.space_id);

const roots: string[] = [];
const createdIds: string[] = [];

async function insertRoot(options: { withdrawn?: boolean; future?: boolean; opened?: boolean; label: string }) {
  const id = crypto.randomUUID();
  roots.push(id);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const future = Boolean(options.future);
  const row = {
    id,
    thread_id: id,
    reply_to_id: null,
    space_id: spaceId,
    author_id: a.userId,
    recipient_id: b.userId,
    entry_type: future ? "future" : "today",
    title: "",
    content: `${marker}_${options.label}`,
    plain_text: `${marker}_${options.label}`,
    excerpt: `${marker}_${options.label}`,
    stationery_theme: "cream",
    entry_date: future ? null : today,
    created_local_date: future ? "2020-01-01" : today,
    published_at: now.toISOString(),
    locked_at: new Date(now.getTime() + 86_400_000).toISOString(),
    sealed_at: future ? now.toISOString() : null,
    open_at: future ? new Date(now.getTime() - 60_000).toISOString() : null,
    opened_at: options.opened ? now.toISOString() : null,
    opened_by: options.opened ? b.userId : null,
    withdrawn_at: options.withdrawn ? now.toISOString() : null,
    status: future ? "sent" : "sent",
    scheduled_created_at: future ? "2020-01-01T00:00:00.000Z" : null,
  };
  const { error } = await service.from("journal_entries").insert(row);
  if (error) throw error;
  return id;
}

function reply(client: SupabaseClient, targetId: string, text: string) {
  return client.rpc("reply_to_letter", {
    p_target_id: targetId,
    p_rich_content: { type: "doc", text },
    p_plain_text: `${marker}_${text}`,
    p_stationery_theme: "cream",
    p_mood_emoji: null,
  });
}

try {
  const replyWithdrawRoot = await insertRoot({ label: "reply_withdraw" });
  const [replyResult, withdrawResult] = await Promise.all([
    reply(b.client, replyWithdrawRoot, "reply_withdraw_child"),
    a.client.rpc("withdraw_letter_diary", { p_entry_id: replyWithdrawRoot }),
  ]);
  const { data: replyWithdrawRows } = await service.from("journal_entries")
    .select("id,reply_to_id,opened_at,withdrawn_at").or(`id.eq.${replyWithdrawRoot},reply_to_id.eq.${replyWithdrawRoot}`);
  const rootState = replyWithdrawRows?.find((row) => row.id === replyWithdrawRoot);
  const childCount = replyWithdrawRows?.filter((row) => row.reply_to_id === replyWithdrawRoot).length ?? 0;
  const legalReplyWin = !replyResult.error && Boolean(withdrawResult.error) && childCount === 1 && rootState?.opened_at && !rootState.withdrawn_at;
  const legalWithdrawWin = Boolean(replyResult.error) && !withdrawResult.error && childCount === 0 && rootState?.withdrawn_at && !rootState.opened_at;
  if (!legalReplyWin && !legalWithdrawWin) throw new Error(`illegal reply/withdraw race: ${JSON.stringify({ replyResult, withdrawResult, rootState, childCount })}`);

  const resendRoot = await insertRoot({ withdrawn: true, label: "resend" });
  const resendArgs = {
    p_withdrawn_id: resendRoot,
    p_rich_content: { type: "doc", text: "resend" },
    p_plain_text: `${marker}_resend_child`,
    p_stationery_theme: "cream",
    p_mood_emoji: null,
  };
  const resendResults = await Promise.all([a.client.rpc("resend_withdrawn_letter", resendArgs), a.client.rpc("resend_withdrawn_letter", resendArgs)]);
  const { data: resendChildren } = await service.from("journal_entries").select("id").eq("reply_to_id", resendRoot);
  if (resendResults.filter((result) => !result.error).length !== 1 || resendChildren?.length !== 1) {
    throw new Error(`illegal resend race: ${JSON.stringify({ resendResults, childCount: resendChildren?.length })}`);
  }

  const capsuleRoot = await insertRoot({ future: true, label: "capsule_open_reply" });
  const [openResult, capsuleReplyResult] = await Promise.all([
    b.client.rpc("open_future_diary", { p_entry_id: capsuleRoot }),
    reply(b.client, capsuleRoot, "capsule_child"),
  ]);
  const { data: capsuleRows } = await service.from("journal_entries")
    .select("id,reply_to_id,opened_at").or(`id.eq.${capsuleRoot},reply_to_id.eq.${capsuleRoot}`);
  const capsuleChildCount = capsuleRows?.filter((row) => row.reply_to_id === capsuleRoot).length ?? 0;
  if (openResult.error || !capsuleRows?.find((row) => row.id === capsuleRoot)?.opened_at || capsuleChildCount > 1
    || (!capsuleReplyResult.error && capsuleChildCount !== 1) || (capsuleReplyResult.error && capsuleChildCount !== 0)) {
    throw new Error(`illegal capsule race: ${JSON.stringify({ openResult, capsuleReplyResult, capsuleChildCount })}`);
  }

  const simultaneousRoot = await insertRoot({ label: "simultaneous" });
  const simultaneous = await Promise.all([reply(b.client, simultaneousRoot, "sim_1"), reply(b.client, simultaneousRoot, "sim_2")]);
  const { data: simultaneousChildren } = await service.from("journal_entries").select("id").eq("reply_to_id", simultaneousRoot);
  if (simultaneous.some((result) => result.error) || simultaneousChildren?.length !== 2) {
    throw new Error(`illegal simultaneous replies: ${JSON.stringify({ simultaneous, childCount: simultaneousChildren?.length })}`);
  }

  const { data: allChildren } = await service.from("journal_entries").select("id").in("thread_id", roots).not("reply_to_id", "is", null);
  createdIds.push(...(allChildren ?? []).map((row) => String(row.id)));
  console.log(JSON.stringify({
    environment: "E2E Test",
    projectRef: guard.projectRef,
    production: guard.production,
    replyWithdrawWinner: legalReplyWin ? "reply" : "withdraw",
    resendSuccesses: resendResults.filter((result) => !result.error).length,
    resendChildCount: resendChildren?.length ?? 0,
    capsuleReplyWon: !capsuleReplyResult.error,
    capsuleChildCount,
    simultaneousReplyCount: simultaneousChildren?.length ?? 0,
  }));
} finally {
  const { data: children } = await service.from("journal_entries").select("id").in("thread_id", roots).not("reply_to_id", "is", null);
  const childIds = (children ?? []).map((row) => String(row.id));
  const allIds = [...childIds, ...roots];
  if (allIds.length) await service.from("notifications").delete().in("source_id", allIds);
  if (childIds.length) await service.from("journal_entries").delete().in("id", childIds);
  if (roots.length) await service.from("journal_entries").delete().in("id", roots);
  await Promise.all([a.client.auth.signOut(), b.client.auth.signOut()]);
}
}

void main();
