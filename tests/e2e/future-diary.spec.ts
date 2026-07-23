import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const marker = `e2e-task9-${Date.now()}-${process.pid}`;
const titlePrefix = `[${marker}]`;
const todayTitle = `${titlePrefix} today private`;
const todayBody = `${marker} today's body`;
const futureTitle = `${titlePrefix} future private`;
const futureBody = `${marker} future body that must stay private`;
const hasIntegrationEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "COUPLE_USER_A_EMAIL",
  "COUPLE_USER_A_PASSWORD",
  "COUPLE_USER_B_EMAIL",
  "COUPLE_USER_B_PASSWORD",
].every((key) => Boolean(process.env[key]));

type Journey = {
  authorContext: BrowserContext;
  recipientContext: BrowserContext;
  authorPage: Page;
  recipientPage: Page;
  service: SupabaseClient;
  recipientApi: SupabaseClient;
  authorId: string;
  recipientId: string;
  futureId: string;
};

let journey: Journey | undefined;

function appUrl(path: string) {
  return new URL(path, baseUrl).toString();
}

function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shanghaiLocalDateTime(date: Date) {
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto(appUrl("/login"));
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入日记" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function signedInApi(email: string, password: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("E2E account did not return a user");
  return { client, userId: data.user.id };
}

async function cleanupRun(service: SupabaseClient, authorId: string, recipientId: string) {
  const { data, error } = await service
    .from("journal_entries")
    .select("id,image_path")
    .in("author_id", [authorId, recipientId])
    .like("title", `${titlePrefix}%`);
  if (error) throw new Error("Unable to find Task 9 fixture rows for cleanup");

  const rows = (data ?? []) as Array<{ id: string; image_path: string | null }>;
  const imagePaths = rows.flatMap((row) => row.image_path ? [row.image_path] : []);
  if (imagePaths.length) {
    const { error: imageError } = await service.storage.from("journal-images").remove(imagePaths);
    if (imageError) throw new Error("Unable to clean Task 9 fixture images");
  }
  if (rows.length) {
    const { error: deleteError } = await service
      .from("journal_entries")
      .delete()
      .in("id", rows.map((row) => row.id));
    if (deleteError) throw new Error("Unable to clean Task 9 fixture rows");
  }
}

async function currentJourney() {
  if (!journey) throw new Error("Task 9 integration fixture was not initialized");
  return journey;
}

test.describe("future diary two-user lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasIntegrationEnvironment, "Integration unavailable: runner validates the required Supabase and two-account fixture.");

  test.beforeAll(async ({ browser }) => {
    const [authorApi, recipientApi] = await Promise.all([
      signedInApi(process.env.COUPLE_USER_A_EMAIL!, process.env.COUPLE_USER_A_PASSWORD!),
      signedInApi(process.env.COUPLE_USER_B_EMAIL!, process.env.COUPLE_USER_B_PASSWORD!),
    ]);
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    await cleanupRun(service, authorApi.userId, recipientApi.userId);
    const [authorContext, recipientContext] = await Promise.all([browser.newContext(), browser.newContext()]);
    const [authorPage, recipientPage] = await Promise.all([authorContext.newPage(), recipientContext.newPage()]);
    await Promise.all([
      signIn(authorPage, process.env.COUPLE_USER_A_EMAIL!, process.env.COUPLE_USER_A_PASSWORD!),
      signIn(recipientPage, process.env.COUPLE_USER_B_EMAIL!, process.env.COUPLE_USER_B_PASSWORD!),
    ]);
    journey = {
      authorContext,
      recipientContext,
      authorPage,
      recipientPage,
      service,
      recipientApi: recipientApi.client,
      authorId: authorApi.userId,
      recipientId: recipientApi.userId,
      futureId: "",
    };
  });

  test.afterAll(async () => {
    if (!journey) return;
    try {
      await cleanupRun(journey.service, journey.authorId, journey.recipientId);
    } finally {
      await Promise.all([journey.authorContext.close(), journey.recipientContext.close()]);
      journey = undefined;
    }
  });

  test("author can create one Shanghai-today diary and one future diary, with independent quotas", async () => {
    const state = await currentJourney();
    await state.authorPage.goto(appUrl("/journal/new"));
    await state.authorPage.locator("#today-diary-title").fill(todayTitle);
    await state.authorPage.locator("#today-diary-content").fill(todayBody);
    await state.authorPage.getByRole("button", { name: "发布今日日记" }).click();
    await expect(state.authorPage.getByRole("status")).toContainText("今日日记已发布");

    await state.authorPage.goto(appUrl("/journal/new"));
    await state.authorPage.locator("#today-diary-title").fill(`${titlePrefix} rejected second today`);
    await state.authorPage.locator("#today-diary-content").fill("second today");
    await state.authorPage.getByRole("button", { name: "发布今日日记" }).click();
    await expect(state.authorPage.getByRole("alert")).toContainText("今天已经写过一篇日记了");

    await state.authorPage.goto(appUrl("/journal/future/new"));
    await state.authorPage.locator("#future-diary-title").fill(futureTitle);
    await state.authorPage.locator("#future-diary-content").fill(futureBody);
    await state.authorPage.locator("#future-diary-open-at").fill(shanghaiLocalDateTime(new Date(Date.now() + 125_000)));
    if (process.env.E2E_IMAGE_PATH) {
      await state.authorPage.locator('input[type="file"]').setInputFiles(process.env.E2E_IMAGE_PATH);
      await expect(state.authorPage.getByAltText("所选日记图片预览")).toBeVisible();
    }
    await state.authorPage.getByRole("button", { name: "确认封存" }).click();
    await expect(state.authorPage.getByRole("status")).toContainText("未来日记已封存");

    await state.authorPage.goto(appUrl("/journal/future/new"));
    await state.authorPage.locator("#future-diary-title").fill(`${titlePrefix} rejected second future`);
    await state.authorPage.locator("#future-diary-content").fill("second future");
    await state.authorPage.locator("#future-diary-open-at").fill(shanghaiLocalDateTime(new Date(Date.now() + 180_000)));
    await state.authorPage.getByRole("button", { name: "确认封存" }).click();
    await expect(state.authorPage.getByRole("alert")).toContainText("今天已经写过一篇未来日记了");

    const { data, error } = await state.service
      .from("journal_entries")
      .select("id,entry_date,created_local_date,image_path")
      .eq("author_id", state.authorId)
      .eq("title", futureTitle)
      .single();
    expect(error).toBeNull();
    expect(data?.created_local_date).toBe(shanghaiDate());
    if (process.env.E2E_IMAGE_PATH) {
      expect(data?.image_path).toEqual(expect.any(String));
    } else {
      expect(data?.image_path).toBeNull();
    }
    state.futureId = String(data?.id);
  });

  test("recipient sees only metadata until server time is ready and they explicitly open", async () => {
    test.setTimeout(180_000);
    const state = await currentJourney();
    await state.recipientPage.goto(appUrl("/journal/future"));
    await expect(state.recipientPage.getByText("时间胶囊")).toBeVisible();
    await expect(state.recipientPage.getByText(futureTitle)).toHaveCount(0);
    await expect(state.recipientPage.getByText(futureBody)).toHaveCount(0);
    await expect(state.recipientPage.getByAltText("日记图片")).toHaveCount(0);

    const directPage = await state.recipientContext.newPage();
    const response = await directPage.goto(appUrl(`/journal/${state.futureId}`));
    expect(response?.status()).toBe(404);
    await expect(directPage.getByText(futureTitle)).toHaveCount(0);
    await expect(directPage.getByText(futureBody)).toHaveCount(0);
    await directPage.close();

    const { data: protectedRow, error: protectedError } = await state.recipientApi
      .from("journal_entries")
      .select("id,title,content,image_path")
      .eq("id", state.futureId)
      .maybeSingle();
    expect(protectedError).toBeNull();
    expect(protectedRow).toBeNull();
    const { data: cards, error: cardsError } = await state.recipientApi.rpc("list_future_diary_cards", { p_box: "received" });
    expect(cardsError).toBeNull();
    const card = (cards as Array<Record<string, unknown>>).find((item) => item.id === state.futureId);
    expect(card).toBeDefined();
    expect(card).not.toHaveProperty("title");
    expect(card).not.toHaveProperty("content");
    expect(card).not.toHaveProperty("image_path");

    await expect(state.recipientPage.getByRole("button", { name: "开启胶囊" })).toBeVisible({ timeout: 150_000 });
    state.recipientPage.once("dialog", (dialog) => dialog.accept());
    await state.recipientPage.getByRole("button", { name: "开启胶囊" }).click();
    await expect(state.recipientPage.getByRole("link", { name: "阅读日记" })).toBeVisible();
    await state.recipientPage.getByRole("link", { name: "阅读日记" }).click();
    await expect(state.recipientPage.getByRole("heading", { name: futureTitle })).toBeVisible();
    await expect(state.recipientPage.getByText(futureBody)).toBeVisible();
    if (process.env.E2E_IMAGE_PATH) await expect(state.recipientPage.getByAltText("日记图片")).toBeVisible();

    await state.recipientPage.locator("#new-journal-comment").fill(`${marker} ordinary comment`);
    await state.recipientPage.getByRole("button", { name: "发布评论" }).click();
    await expect(state.recipientPage.getByText(`${marker} ordinary comment`)).toBeVisible();

    const keyboardBody = state.recipientPage.locator("#keyboard-journal-body");
    await keyboardBody.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(0, 1);
    });
    await keyboardBody.press("Shift+ArrowRight");
    await expect(state.recipientPage.getByRole("dialog", { name: "添加划线批注" })).toBeVisible();
    await state.recipientPage.locator("#annotation-comment").fill(`${marker} annotation`);
    await state.recipientPage.getByRole("button", { name: "发布批注" }).click();
    await expect(state.recipientPage.getByText(`${marker} annotation`)).toBeVisible();
    const replyInput = state.recipientPage.locator('input[id^="reply-"]');
    await replyInput.fill(`${marker} reply`);
    await state.recipientPage.getByRole("button", { name: "回复" }).click();
    await expect(state.recipientPage.getByText(`${marker} reply`)).toBeVisible();
  });

  test("author can reread a sealed future diary but cannot edit, delete, or withdraw it", async () => {
    const state = await currentJourney();
    await state.authorPage.goto(appUrl("/journal/future?box=sent"));
    await state.authorPage.getByRole("link", { name: "回看日记" }).click();
    await expect(state.authorPage.getByRole("heading", { name: futureTitle })).toBeVisible();
    await expect(state.authorPage.getByText(futureBody)).toBeVisible();
    await expect(state.authorPage.getByRole("link", { name: /编辑/ })).toHaveCount(0);
    await expect(state.authorPage.getByRole("button", { name: /删除|撤回/ })).toHaveCount(0);
    const response = await state.authorPage.goto(appUrl(`/journal/${state.futureId}/edit`));
    expect(response?.status()).toBe(404);
  });
});
