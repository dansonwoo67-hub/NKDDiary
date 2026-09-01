import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { browserContextOptionsFromProjectUse } from "../../scripts/playwright-e2e-config";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const timeout = 30_000;
const hasEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "COUPLE_USER_A_EMAIL", "COUPLE_USER_A_PASSWORD", "COUPLE_USER_B_EMAIL", "COUPLE_USER_B_PASSWORD",
].every((key) => Boolean(process.env[key]));

type State = {
  marker: string;
  service: SupabaseClient;
  susanApi: SupabaseClient;
  nikiApi: SupabaseClient;
  susanId: string;
  nikiId: string;
  susanContext: BrowserContext;
  nikiContext: BrowserContext;
  susan: Page;
  niki: Page;
};

let state: State | undefined;

function appUrl(path: string) {
  return new URL(path, baseUrl).toString();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto(appUrl("/login"));
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入日记" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 300_000 });
}

async function signedInApi(email: string, password: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("E2E user missing");
  return { client, userId: data.user.id };
}

async function replaceRichComposerBody(page: Page, body: string) {
  const editor = page.locator('[contenteditable="true"][role="textbox"]');
  await expect(editor).toBeVisible();
  await editor.evaluate((element, nextBody) => {
    element.textContent = nextBody;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextBody, inputType: "insertText" }));
  }, body);
  await expect(editor).toHaveText(body);
}

async function sendOrdinary(page: Page, body: string) {
  await page.goto(appUrl("/journal"));
  await page.getByRole("button", { name: /写一封信|继续写信/ }).click();
  await replaceRichComposerBody(page, body);
  await page.getByRole("button", { name: "完成写信" }).click();
  await page.getByRole("button", { name: "寄出这封信" }).click();
}

async function waitForEntry(service: SupabaseClient, authorId: string, content: string) {
  await expect.poll(async () => {
    const { data, error } = await service.from("journal_entries").select("id,thread_id,reply_to_id,withdrawn_at").eq("author_id", authorId).eq("content", content).maybeSingle();
    if (error) throw error;
    return data;
  }, { timeout }).not.toBeNull();
  const { data, error } = await service.from("journal_entries").select("id,thread_id,reply_to_id,withdrawn_at").eq("author_id", authorId).eq("content", content).single();
  if (error || !data) throw error ?? new Error("Expected letter row");
  return data;
}

function localDateTime(date: Date) {
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

async function cleanup(service: SupabaseClient, userIds: string[], marker: string) {
  const { data: rows, error } = await service
    .from("journal_entries")
    .select("id,reply_to_id,content")
    .in("author_id", userIds)
    .like("content", `${marker}%`);
  if (error) throw error;
  const ids = (rows ?? []).map((row) => String(row.id));
  if (!ids.length) return;
  const { data: comments, error: commentReadError } = await service.from("journal_comments").select("id").in("entry_id", ids);
  if (commentReadError) throw commentReadError;
  const sources = [...ids, ...(comments ?? []).map((row) => String(row.id))];
  const { error: notificationError } = await service.from("notifications").delete().in("source_id", sources);
  if (notificationError) throw notificationError;
  const { error: commentError } = await service.from("journal_comments").delete().in("entry_id", ids);
  if (commentError) throw commentError;

  const remaining = new Map((rows ?? []).map((row) => [String(row.id), row.reply_to_id ? String(row.reply_to_id) : null]));
  while (remaining.size) {
    const parentIds = new Set([...remaining.values()].filter((id): id is string => Boolean(id)));
    const leaves = [...remaining.keys()].filter((id) => !parentIds.has(id));
    if (!leaves.length) throw new Error("E2E cleanup found a letter cycle");
    const { error: deleteError } = await service.from("journal_entries").delete().in("id", leaves);
    if (deleteError) throw deleteError;
    for (const id of leaves) remaining.delete(id);
  }
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test.describe("letter thread visible lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasEnvironment, "Test Supabase and Susan/Niki fixtures are required");

  test.beforeAll(async ({ browser }, testInfo) => {
    const [susanIdentity, nikiIdentity] = await Promise.all([
      signedInApi(process.env.COUPLE_USER_A_EMAIL!, process.env.COUPLE_USER_A_PASSWORD!),
      signedInApi(process.env.COUPLE_USER_B_EMAIL!, process.env.COUPLE_USER_B_PASSWORD!),
    ]);
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const marker = `e2e_thread_${testInfo.project.name.replaceAll("-", "_")}_${Date.now()}_${process.pid}`;
    await cleanup(service, [susanIdentity.userId, nikiIdentity.userId], "e2e_thread_");
    const options = browserContextOptionsFromProjectUse(testInfo.project.use as Record<string, unknown>) as BrowserContextOptions;
    const [susanContext, nikiContext] = await Promise.all([browser.newContext(options), browser.newContext(options)]);
    const [susan, niki] = await Promise.all([susanContext.newPage(), nikiContext.newPage()]);
    await signIn(susan, process.env.COUPLE_USER_A_EMAIL!, process.env.COUPLE_USER_A_PASSWORD!);
    await signIn(niki, process.env.COUPLE_USER_B_EMAIL!, process.env.COUPLE_USER_B_PASSWORD!);
    state = {
      marker, service,
      susanApi: susanIdentity.client, nikiApi: nikiIdentity.client,
      susanId: susanIdentity.userId, nikiId: nikiIdentity.userId,
      susanContext, nikiContext, susan, niki,
    };
  });

  test.afterAll(async () => {
    if (!state) return;
    try {
      await cleanup(state.service, [state.susanId, state.nikiId], state.marker);
      const { count, error } = await state.service.from("journal_entries").select("id", { count: "exact", head: true }).like("content", `${state.marker}%`);
      if (error) throw error;
      expect(count).toBe(0);
    } finally {
      await Promise.all([state.susanContext.close(), state.nikiContext.close()]);
      state = undefined;
    }
  });

  test("ordinary replies stay in one thread and read notifications remain navigable", async () => {
    if (!state) throw new Error("Missing state");
    const rootBody = `${state.marker} ordinary root`;
    const nikiReply = `${state.marker} niki reply`;
    const susanReply = `${state.marker} susan reply`;
    await sendOrdinary(state.susan, rootBody);
    const root = await waitForEntry(state.service, state.susanId, rootBody);

    await state.niki.goto(appUrl("/"));
    await state.niki.getByRole("button", { name: "收信箱" }).click();
    await state.niki.locator(".notification-row").first().click();
    await expect(state.niki).toHaveURL(new RegExp(`/journal/thread/${root.thread_id}\\?letter=${root.id}`), { timeout });
    await expect(state.niki.getByText(rootBody)).toBeVisible({ timeout });
    await expect(state.niki.getByText("往来 1 封")).toBeVisible();
    await assertNoOverflow(state.niki);

    await state.niki.getByRole("button", { name: "收信箱" }).click();
    await state.niki.locator(".notification-row").first().click();
    await expect(state.niki).toHaveURL(new RegExp(`/journal/thread/${root.thread_id}`));

    await state.niki.getByRole("button", { name: "立即回信" }).click();
    await state.niki.getByRole("textbox", { name: "信件内容" }).fill(nikiReply);
    await state.niki.getByRole("button", { name: "寄出回信" }).click();
    const reply = await waitForEntry(state.service, state.nikiId, nikiReply);
    expect(reply.thread_id).toBe(root.thread_id);
    expect(reply.reply_to_id).toBe(root.id);
    await expect(state.niki.getByText("往来 2 封")).toBeVisible({ timeout });

    await state.susan.goto(appUrl("/journal"));
    await state.susan.getByRole("link").filter({ hasText: nikiReply }).click();
    await expect(state.susan.getByText("往来 2 封")).toBeVisible();
    await state.susan.getByRole("button", { name: "立即回信" }).click();
    await state.susan.getByRole("textbox", { name: "信件内容" }).fill(susanReply);
    await state.susan.getByRole("button", { name: "寄出回信" }).click();
    const third = await waitForEntry(state.service, state.susanId, susanReply);
    expect(third.thread_id).toBe(root.thread_id);
    expect(third.reply_to_id).toBe(reply.id);
    await expect(state.susan.getByText("往来 3 封")).toBeVisible({ timeout });
  });

  test("sealed capsule blocks reply, then opens and accepts an ordinary reply in the same thread", async () => {
    if (!state) throw new Error("Missing state");
    const capsuleBody = `${state.marker} capsule root`;
    const capsuleReply = `${state.marker} capsule reply`;
    await state.susan.goto(appUrl("/journal/future/new"));
    await replaceRichComposerBody(state.susan, capsuleBody);
    const openAt = new Date(Date.now() + 90_000);
    openAt.setSeconds(0, 0);
    if (openAt.getTime() < Date.now() + 90_000) openAt.setMinutes(openAt.getMinutes() + 1);
    await state.susan.locator('input[type="datetime-local"]').fill(localDateTime(openAt));
    await state.susan.getByRole("button", { name: "确认封存" }).click();
    await state.susan.getByRole("button", { name: "封存胶囊信" }).click();
    const root = await waitForEntry(state.service, state.susanId, capsuleBody);

    await state.niki.goto(appUrl("/journal"));
    await state.niki.getByRole("link").filter({ hasText: "始于一封胶囊信" }).first().click();
    await expect(state.niki.getByRole("button", { name: "立即回信" })).toHaveCount(0);
    await expect(state.niki.getByText(capsuleBody)).toHaveCount(0);
    const openButton = state.niki.getByRole("button", { name: "开启胶囊" });
    await expect(openButton).toBeVisible({ timeout: 240_000 });
    state.niki.once("dialog", (dialog) => dialog.accept());
    await openButton.click();
    await expect(state.niki.getByText(capsuleBody)).toBeVisible({ timeout });
    await state.niki.getByRole("button", { name: "立即回信" }).click();
    await state.niki.getByRole("textbox", { name: "信件内容" }).fill(capsuleReply);
    await state.niki.getByRole("button", { name: "寄出回信" }).click();
    const reply = await waitForEntry(state.service, state.nikiId, capsuleReply);
    expect(reply.thread_id).toBe(root.thread_id);
    expect(reply.reply_to_id).toBe(root.id);
    await expect(state.niki.getByText("往来 2 封")).toBeVisible({ timeout });
    await assertNoOverflow(state.niki);
  });

  test("withdrawal confirms, redacts recipient view, and resends once without mutating the original", async () => {
    if (!state) throw new Error("Missing state");
    const withdrawnBody = `${state.marker} withdrawn secret`;
    const resentBody = `${state.marker} resent edited`;
    await sendOrdinary(state.susan, withdrawnBody);
    const original = await waitForEntry(state.service, state.susanId, withdrawnBody);
    await state.susan.goto(appUrl("/journal"));
    await state.susan.getByRole("link").filter({ hasText: withdrawnBody }).click();
    await state.susan.getByRole("button", { name: "撤回" }).click();
    await expect(state.susan.getByText("确定撤回这封信吗？")).toBeVisible();
    await state.susan.getByRole("button", { name: "确定撤回" }).click();
    await expect.poll(async () => {
      const { data, error } = await state!.service.from("journal_entries").select("withdrawn_at").eq("id", original.id).single();
      if (error) throw error;
      return data.withdrawn_at;
    }, { timeout }).not.toBeNull();

    await state.niki.goto(appUrl("/journal"));
    await state.niki.getByRole("link").filter({ hasText: "对方撤回了一封信" }).first().click();
    await expect(state.niki.getByText("对方撤回了一封信")).toBeVisible();
    await expect(state.niki.getByText(withdrawnBody)).toHaveCount(0);
    expect(await state.niki.content()).not.toContain(withdrawnBody);

    await state.susan.goto(appUrl(`/journal/thread/${original.thread_id}`));
    await expect(state.susan.getByText("这封信已撤回")).toBeVisible();
    await state.susan.getByRole("button", { name: "查看原文" }).click();
    await expect(state.susan.getByText(withdrawnBody)).toBeVisible();
    await state.susan.getByRole("button", { name: "重新编辑并发送" }).click();
    await expect(state.susan.getByRole("textbox", { name: "信件内容" })).toHaveValue(withdrawnBody);
    await state.susan.getByRole("textbox", { name: "信件内容" }).fill(resentBody);
    await state.susan.getByRole("button", { name: "重新发送" }).click();
    const resent = await waitForEntry(state.service, state.susanId, resentBody);
    expect(resent.thread_id).toBe(original.thread_id);
    expect(resent.reply_to_id).toBe(original.id);
    const { data: preserved, error } = await state.service.from("journal_entries").select("content,withdrawn_at").eq("id", original.id).single();
    expect(error).toBeNull();
    expect(preserved?.content).toBe(withdrawnBody);
    expect(preserved?.withdrawn_at).not.toBeNull();
    await expect(state.susan.getByRole("button", { name: "重新编辑并发送" })).toHaveCount(0);
    await expect(state.susan.getByText("往来 2 封")).toBeVisible({ timeout });
    await assertNoOverflow(state.susan);
  });
});
