import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { browserContextOptionsFromProjectUse } from "../../scripts/playwright-e2e-config";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const marker = `e2e-task9-${Date.now()}-${process.pid}`;
const futureBody = `${marker} future body that must stay private`;
const task9ContentPrefix = "e2e-task9-";
const AUTHORIZATION_DENIAL_CODE = "42501";
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
  authorApi: SupabaseClient;
  recipientApi: SupabaseClient;
  authorId: string;
  recipientId: string;
  futureId: string;
  creationShanghaiDate: string;
  futureOpenAt: string;
  futureImagePath: string | null;
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

function nextSafeOpenTime(now = new Date()) {
  const minimum = new Date(now.getTime() + 90_000);
  minimum.setSeconds(0, 0);
  if (minimum.getTime() < now.getTime() + 90_000) minimum.setMinutes(minimum.getMinutes() + 1);
  return minimum;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto(appUrl("/login"));
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "进入日记" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 45_000 });
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

async function replaceComposerBody(page: Page, body: string) {
  const editor = page.locator('[contenteditable="true"][role="textbox"]');
  await expect(editor).toBeVisible();
  await expect(editor).not.toHaveText("");
  await editor.evaluate((element, nextBody) => {
    element.textContent = nextBody;
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: nextBody,
      inputType: "insertText",
    }));
  }, body);
  await expect(editor).toHaveText(body);
}

async function cleanupTask9Rows(service: SupabaseClient, authorId: string, recipientId: string) {
  const { data, error } = await service
    .from("journal_entries")
    .select("id,image_path")
    .in("author_id", [authorId, recipientId])
    .like("content", `${task9ContentPrefix}%`);
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

async function assertNoFixtureContamination(service: SupabaseClient, authorId: string, creationDate: string) {
  const { data, error } = await service
    .from("journal_entries")
    .select("id,content,entry_type,created_local_date")
    .eq("author_id", authorId)
    .eq("entry_type", "future")
    .eq("created_local_date", creationDate);
  if (error) throw new Error("Unable to check Task 9 fixture contamination");
  const conflicting = (data ?? []).filter((row) => !String(row.content).startsWith(task9ContentPrefix));
  if (conflicting.length) {
    throw new Error("Task 9 fixture is contaminated by a non-Task-9 same-day capsule letter; clean the dedicated test accounts and rerun.");
  }
}

async function assertMobileContext(page: Page, isMobileProject: boolean) {
  if (!isMobileProject) return;
  const browserSignals = await page.evaluate(() => ({
    width: window.innerWidth,
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
  }));
  expect(browserSignals.width).toBeLessThanOrEqual(450);
  expect(browserSignals.maxTouchPoints).toBeGreaterThan(0);
  expect(browserSignals.userAgent).toMatch(/Android|Mobile/i);
}

async function assertRecipientStillPrivate(state: Journey) {
  await expect(state.recipientPage.getByText(futureBody)).toHaveCount(0);
  await expect(state.recipientPage.getByAltText("信件图片")).toHaveCount(0);
  expect(await state.recipientPage.content()).not.toContain(state.futureImagePath ?? "journal-images/");

  const directPage = await state.recipientContext.newPage();
  const response = await directPage.goto(appUrl(`/journal/${state.futureId}`));
  expect(response?.status()).toBe(404);
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
}

async function currentJourney() {
  if (!journey) throw new Error("Task 9 integration fixture was not initialized");
  return journey;
}

test.describe("capsule letter two-user lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasIntegrationEnvironment, "Integration unavailable: runner validates the required Supabase and two-account fixture.");

  test.beforeAll(async ({ browser }, testInfo) => {
    const [authorApi, recipientApi] = await Promise.all([
      signedInApi(process.env.COUPLE_USER_A_EMAIL!, process.env.COUPLE_USER_A_PASSWORD!),
      signedInApi(process.env.COUPLE_USER_B_EMAIL!, process.env.COUPLE_USER_B_PASSWORD!),
    ]);
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const creationShanghaiDate = shanghaiDate();
    await cleanupTask9Rows(service, authorApi.userId, recipientApi.userId);
    await assertNoFixtureContamination(service, authorApi.userId, creationShanghaiDate);
    const contextOptions = browserContextOptionsFromProjectUse(testInfo.project.use as Record<string, unknown>) as BrowserContextOptions;
    const [authorContext, recipientContext] = await Promise.all([
      browser.newContext(contextOptions),
      browser.newContext(contextOptions),
    ]);
    const [authorPage, recipientPage] = await Promise.all([authorContext.newPage(), recipientContext.newPage()]);
    await signIn(authorPage, process.env.COUPLE_USER_A_EMAIL!, process.env.COUPLE_USER_A_PASSWORD!);
    await signIn(recipientPage, process.env.COUPLE_USER_B_EMAIL!, process.env.COUPLE_USER_B_PASSWORD!);
    await Promise.all([
      assertMobileContext(authorPage, testInfo.project.name === "mobile-375"),
      assertMobileContext(recipientPage, testInfo.project.name === "mobile-375"),
    ]);
    journey = {
      authorContext,
      recipientContext,
      authorPage,
      recipientPage,
      service,
      authorApi: authorApi.client,
      recipientApi: recipientApi.client,
      authorId: authorApi.userId,
      recipientId: recipientApi.userId,
      futureId: "",
      creationShanghaiDate,
      futureOpenAt: "",
      futureImagePath: null,
    };
  });

  test.afterAll(async () => {
    if (!journey) return;
    try {
      await cleanupTask9Rows(journey.service, journey.authorId, journey.recipientId);
    } finally {
      await Promise.all([journey.authorContext.close(), journey.recipientContext.close()]);
      journey = undefined;
    }
  });

  test("author can create one Shanghai-today capsule letter and the daily capsule quota remains enforced", async () => {
    const state = await currentJourney();
    await state.authorPage.goto(appUrl("/journal/future/new"));
    await replaceComposerBody(state.authorPage, futureBody);
    const openAt = nextSafeOpenTime();
    state.futureOpenAt = openAt.toISOString();
    await state.authorPage.locator('input[type="datetime-local"]').fill(shanghaiLocalDateTime(openAt));
    await state.authorPage.getByRole("button", { name: "确认封存" }).click();
    await state.authorPage.getByRole("button", { name: "封存胶囊信" }).click();
    await expect(state.authorPage.getByText("胶囊信已封存，会在约定时间送到 TA 手中。")).toBeVisible();

    await state.authorPage.goto(appUrl("/journal/future/new"));
    await replaceComposerBody(state.authorPage, `${marker} rejected second future`);
    await state.authorPage.locator('input[type="datetime-local"]').fill(shanghaiLocalDateTime(nextSafeOpenTime(new Date(Date.now() + 60_000))));
    await state.authorPage.getByRole("button", { name: "确认封存" }).click();
    await state.authorPage.getByRole("button", { name: "封存胶囊信" }).click();
    await expect(state.authorPage.getByText(/今天的小胶囊已经认真封存好一封啦|今天已经封存过一封胶囊信了/)).toBeVisible();

    if (shanghaiDate() !== state.creationShanghaiDate) {
      throw new Error("Shanghai date changed while creating Task 9 fixtures; rerun the serial journey.");
    }
    const { data, error } = await state.service
      .from("journal_entries")
      .select("id,entry_type,entry_date,created_local_date,image_path,title,content,open_at")
      .eq("author_id", state.authorId)
      .eq("content", futureBody)
      .single();
    expect(error).toBeNull();
    expect(data?.entry_type).toBe("future");
    expect(data?.created_local_date).toBe(state.creationShanghaiDate);
    expect(data?.image_path).toBeNull();
    state.futureId = String(data?.id);
    state.futureImagePath = data?.image_path ?? null;
    state.futureOpenAt = String(data?.open_at ?? state.futureOpenAt);
  });

  test("author can reread a sealed capsule letter but cannot edit, delete, withdraw, or mutate it", async () => {
    const state = await currentJourney();
    const { data: before, error: beforeError } = await state.service
      .from("journal_entries")
      .select("id,content,open_at")
      .eq("id", state.futureId)
      .single();
    expect(beforeError).toBeNull();
    expect(before?.open_at).toBe(state.futureOpenAt);
    await state.authorPage.goto(appUrl("/journal/future?box=sent"));
    await state.authorPage.getByText(futureBody).locator("..").getByRole("link", { name: "回看日记" }).click();
    await expect(state.authorPage.getByText(futureBody)).toBeVisible();
    await expect(state.authorPage.getByRole("link", { name: /编辑/ })).toHaveCount(0);
    await expect(state.authorPage.getByRole("button", { name: /删除|撤回/ })).toHaveCount(0);
    await state.authorPage.goto(appUrl(`/journal/${state.futureId}/edit`));
    await expect(state.authorPage).toHaveURL(new RegExp(`/journal/${state.futureId}$`));
    await expect(state.authorPage.getByRole("heading", { name: /修改这封信/ })).toHaveCount(0);

    const { data: authorIdentity, error: authorIdentityError } = await state.authorApi.auth.getUser();
    expect(authorIdentityError).toBeNull();
    expect(authorIdentity.user?.id).toBe(state.authorId);
    const { error: updateError } = await state.authorApi
      .from("journal_entries")
      .update({ content: `${futureBody} mutated` })
      .eq("id", state.futureId);
    const { error: deleteError } = await state.authorApi
      .from("journal_entries")
      .delete()
      .eq("id", state.futureId);
    expect(updateError).toMatchObject({ code: AUTHORIZATION_DENIAL_CODE });
    expect(deleteError).toMatchObject({ code: AUTHORIZATION_DENIAL_CODE });
    const { data: after, error: afterError } = await state.service
      .from("journal_entries")
      .select("id,content,open_at")
      .eq("id", state.futureId)
      .single();
    expect(afterError).toBeNull();
    expect(after).toEqual(before);
  });

  test("recipient sees only capsule metadata before and after readiness until they explicitly open", async () => {
    test.setTimeout(330_000);
    const state = await currentJourney();
    await state.recipientPage.goto(appUrl("/journal/future"));
    await expect(state.recipientPage.getByText("时间胶囊")).toBeVisible();
    await expect(state.recipientPage.getByText("封存于：")).toBeVisible();
    await expect(state.recipientPage.getByText("约定开启：")).toBeVisible();
    await expect(state.recipientPage.getByText("距离可开启")).toBeVisible();
    await assertRecipientStillPrivate(state);

    await expect(state.recipientPage.getByRole("button", { name: "开启胶囊" })).toBeVisible({ timeout: 270_000 });
    await assertRecipientStillPrivate(state);
    state.recipientPage.once("dialog", (dialog) => dialog.accept());
    await state.recipientPage.getByRole("button", { name: "开启胶囊" }).click();
    await expect(state.recipientPage.getByRole("link", { name: "阅读日记" })).toBeVisible({ timeout: 15_000 });
    await state.recipientPage.getByRole("link", { name: "阅读日记" }).click();
    await expect(state.recipientPage.getByText(futureBody)).toBeVisible();
    const commentSection = state.recipientPage.locator("section").filter({
      has: state.recipientPage.getByRole("heading", { name: /评论/ }),
    });
    await commentSection.getByRole("textbox").fill(`${marker} ordinary comment`);
    await commentSection.getByRole("button").last().click();
    await expect(state.recipientPage.getByText(`${marker} ordinary comment`)).toBeVisible();

    const commentCard = state.recipientPage
      .getByText(`${marker} ordinary comment`)
      .locator("xpath=ancestor::div[starts-with(@id,'comment-')][1]");
    await commentCard.getByRole("button", { name: "回复" }).click();
    await commentSection.getByRole("textbox").fill(`${marker} reply`);
    await commentSection.getByRole("button").last().click();
    await expect(state.recipientPage.getByText(`${marker} reply`)).toBeVisible();
    await state.recipientPage.reload();
    await expect(state.recipientPage.getByText(`${marker} ordinary comment`)).toBeVisible();
    await expect(state.recipientPage.getByText(`${marker} reply`)).toBeVisible();
  });

});
