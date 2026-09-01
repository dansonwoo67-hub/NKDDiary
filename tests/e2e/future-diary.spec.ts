import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { browserContextOptionsFromProjectUse } from "../../scripts/playwright-e2e-config";
import { selectE2eJournalFixtures } from "../../scripts/e2e-fixture-scope";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const marker = `e2e_${Date.now()}_${process.pid}`;
const futureBody = `${marker} future body that must stay private`;
const e2eContentPrefix = "e2e_";
const AUTHORIZATION_DENIAL_CODE = "42501";
const WRITE_FEEDBACK_TIMEOUT_MS = 30_000;
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
  storageFixturePath: string | null;
};

let journey: Journey | undefined;

function appUrl(path: string) {
  return new URL(path, baseUrl).toString();
}

function isNextServerActionRequest(request: { method(): string; headers(): Record<string, string> }) {
  return request.method() === "POST" && Boolean(request.headers()["next-action"]);
}

function observeNextServerAction(page: Page) {
  const requestStarted = page.waitForRequest(isNextServerActionRequest, {
    timeout: WRITE_FEEDBACK_TIMEOUT_MS,
  }).then((request) => ({ request, observedAt: Date.now() }));
  const responseReceived = requestStarted.then(async ({ request }) => {
    const response = await request.response();
    if (!response) throw new Error("Next Server Action request completed without a response");
    return { response, observedAt: Date.now() };
  });
  return { requestStarted, responseReceived };
}

async function waitForJournalEntry(
  service: SupabaseClient,
  authorId: string,
  content: string,
) {
  let confirmedAt = 0;
  await expect.poll(async () => {
    const result = await service
      .from("journal_entries")
      .select("id")
      .eq("author_id", authorId)
      .eq("content", content)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data && !confirmedAt) confirmedAt = Date.now();
    return Boolean(result.data);
  }, { timeout: WRITE_FEEDBACK_TIMEOUT_MS }).toBe(true);
  const result = await service
    .from("journal_entries")
    .select("id")
    .eq("author_id", authorId)
    .eq("content", content)
    .single();
  if (result.error || !result.data) throw result.error ?? new Error("Expected capsule row was not persisted");
  return { row: result.data, confirmedAt };
}

async function waitForComment(
  service: SupabaseClient,
  entryId: string,
  body: string,
) {
  let confirmedAt = 0;
  await expect.poll(async () => {
    const result = await service
      .from("journal_comments")
      .select("id,parent_id")
      .eq("entry_id", entryId)
      .eq("body", body)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data && !confirmedAt) confirmedAt = Date.now();
    return Boolean(result.data);
  }, { timeout: WRITE_FEEDBACK_TIMEOUT_MS }).toBe(true);
  const result = await service
    .from("journal_comments")
    .select("id,parent_id")
    .eq("entry_id", entryId)
    .eq("body", body)
    .single();
  if (result.error || !result.data) throw result.error ?? new Error("Expected comment row was not persisted");
  return { row: result.data, confirmedAt };
}

async function reportActionTimeline(
  label: string,
  clickedAt: number,
  probe: ReturnType<typeof observeNextServerAction>,
  dbConfirmedAt: number,
  domVisibleAt: number,
) {
  const [{ observedAt: requestStartedAt }, { response, observedAt: responseReceivedAt }] = await Promise.all([
    probe.requestStarted,
    probe.responseReceived,
  ]);
  console.log(JSON.stringify({
    flow: label,
    clickTimestamp: new Date(clickedAt).toISOString(),
    actionStartedMs: Math.max(0, Math.round(requestStartedAt - clickedAt)),
    dbMutationConfirmedMs: dbConfirmedAt - clickedAt,
    actionResponseReceivedMs: responseReceivedAt - clickedAt,
    responseStatus: response.status(),
    expectedDomVisibleMs: domVisibleAt - clickedAt,
  }));
}

function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function commentCardForBody(section: ReturnType<Page["locator"]>, body: string) {
  return section
    .getByText(body, { exact: true })
    .locator("xpath=ancestor::div[starts-with(@id,'comment-')][1]");
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
  await expect(page).toHaveURL(/\/$/, { timeout: 300_000 });
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

async function cleanupE2eRows(
  service: SupabaseClient,
  authorId: string,
  recipientId: string,
  markerPrefix: string,
) {
  const { data, error } = await service
    .from("journal_entries")
    .select("id,author_id,content,image_path")
    .in("author_id", [authorId, recipientId]);
  if (error) throw new Error("Unable to find Task 9 fixture rows for cleanup");

  const rows = selectE2eJournalFixtures(data ?? [], [authorId, recipientId], markerPrefix);
  if (!rows.length) return;
  const entryIds = rows.map((row) => row.id);
  const { data: comments, error: commentsError } = await service
    .from("journal_comments")
    .select("id")
    .in("entry_id", entryIds);
  if (commentsError) throw new Error(`Unable to inspect E2E fixture comments for cleanup (${markerPrefix})`);
  const notificationSourceIds = [...entryIds, ...(comments ?? []).map((comment) => String(comment.id))];
  const { error: notificationError } = await service
    .from("notifications")
    .delete()
    .in("source_id", notificationSourceIds);
  if (notificationError) throw new Error(`Unable to clean E2E fixture notifications (${markerPrefix})`);
  const { error: commentError } = await service
    .from("journal_comments")
    .delete()
    .in("entry_id", entryIds);
  if (commentError) throw new Error(`Unable to clean E2E fixture comments (${markerPrefix})`);
  const imagePaths = rows.flatMap((row) => row.image_path ? [row.image_path] : []);
  if (imagePaths.length) {
    const { error: imageError } = await service.storage.from("journal-images").remove(imagePaths);
    if (imageError) throw new Error("Unable to clean Task 9 fixture images");
  }
  if (rows.length) {
    const { error: deleteError } = await service
      .from("journal_entries")
      .delete()
      .in("id", entryIds);
    if (deleteError) throw new Error("Unable to clean Task 9 fixture rows");
  }
}

async function cleanupStorageFixture(service: SupabaseClient, storagePath: string | null) {
  if (!storagePath) return;
  const { error } = await service.storage.from("journal-images").remove([storagePath]);
  if (error) throw new Error(`Unable to clean E2E Storage fixture (${marker})`);
}

async function assertNoFixtureContamination(service: SupabaseClient, authorId: string, creationDate: string) {
  const { data, error } = await service
    .from("journal_entries")
    .select("id,content,entry_type,created_local_date")
    .eq("author_id", authorId)
    .eq("entry_type", "future")
    .eq("created_local_date", creationDate);
  if (error) throw new Error("Unable to check Task 9 fixture contamination");
  const conflicting = (data ?? []).filter((row) => !String(row.content).startsWith(e2eContentPrefix));
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
    await cleanupE2eRows(service, authorApi.userId, recipientApi.userId, e2eContentPrefix);
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
      storageFixturePath: null,
    };
  });

  test.afterAll(async () => {
    if (!journey) return;
    try {
      await Promise.all([
        cleanupE2eRows(journey.service, journey.authorId, journey.recipientId, marker),
        cleanupStorageFixture(journey.service, journey.storageFixturePath),
      ]);
    } finally {
      await Promise.all([journey.authorContext.close(), journey.recipientContext.close()]);
      journey = undefined;
    }
  });

  test("isolated journal Storage accepts and cleans a marker-scoped image fixture", async () => {
    const state = await currentJourney();
    const storagePath = `e2e/${marker}.webp`;
    state.storageFixturePath = storagePath;
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const { data, error } = await state.service.storage.from("journal-images").upload(storagePath, bytes, {
      contentType: "image/webp",
      upsert: false,
    });
    expect(error).toBeNull();
    expect(data?.path).toBe(storagePath);
    const { error: downloadError } = await state.service.storage.from("journal-images").download(storagePath);
    expect(downloadError).toBeNull();
  });

  test("author can create one Shanghai-today capsule letter and the daily capsule quota remains enforced", async () => {
    const state = await currentJourney();
    await state.authorPage.goto(appUrl("/journal/future/new"));
    await replaceComposerBody(state.authorPage, futureBody);
    const openAt = nextSafeOpenTime();
    state.futureOpenAt = openAt.toISOString();
    await state.authorPage.locator('input[type="datetime-local"]').fill(shanghaiLocalDateTime(openAt));
    await state.authorPage.getByRole("button", { name: "确认封存" }).click();
    const firstProbe = observeNextServerAction(state.authorPage);
    const firstClickedAt = Date.now();
    const persistedFuture = waitForJournalEntry(state.service, state.authorId, futureBody);
    await state.authorPage.getByRole("button", { name: "封存胶囊信" }).click();
    await expect(state.authorPage.getByText("胶囊信已封存，会在约定时间送到 TA 手中。"))
      .toBeVisible({ timeout: WRITE_FEEDBACK_TIMEOUT_MS });
    const firstDomVisibleAt = Date.now();
    const persisted = await persistedFuture;
    await reportActionTimeline(
      "capsule-create",
      firstClickedAt,
      firstProbe,
      persisted.confirmedAt,
      firstDomVisibleAt,
    );

    await state.authorPage.goto(appUrl("/journal/future/new"));
    await replaceComposerBody(state.authorPage, `${marker} rejected second future`);
    await state.authorPage.locator('input[type="datetime-local"]').fill(shanghaiLocalDateTime(nextSafeOpenTime(new Date(Date.now() + 60_000))));
    await state.authorPage.getByRole("button", { name: "确认封存" }).click();
    const quotaProbe = observeNextServerAction(state.authorPage);
    const quotaClickedAt = Date.now();
    await state.authorPage.getByRole("button", { name: "封存胶囊信" }).click();
    await expect(state.authorPage.getByText(/今天的小胶囊已经认真封存好一封啦|今天已经封存过一封胶囊信了/))
      .toBeVisible({ timeout: WRITE_FEEDBACK_TIMEOUT_MS });
    const quotaDomVisibleAt = Date.now();
    const { count: quotaCount, error: quotaCountError } = await state.service
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("author_id", state.authorId)
      .eq("entry_type", "future")
      .eq("created_local_date", state.creationShanghaiDate);
    expect(quotaCountError).toBeNull();
    expect(quotaCount).toBe(1);
    await reportActionTimeline(
      "capsule-quota",
      quotaClickedAt,
      quotaProbe,
      quotaDomVisibleAt,
      quotaDomVisibleAt,
    );

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
    test.setTimeout(600_000);
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
    const readerLink = state.recipientPage.getByRole("link", { name: "阅读日记" });
    await expect(readerLink).toBeVisible({ timeout: 30_000 });
    await expect(readerLink).toHaveAttribute("href", `/journal/${state.futureId}`);
    await state.recipientPage.goto(appUrl(`/journal/${state.futureId}`));
    await expect(state.recipientPage.getByText(futureBody)).toBeVisible({ timeout: 60_000 });
    const commentSection = state.recipientPage.locator("section").filter({
      has: state.recipientPage.getByRole("heading", { name: /评论/ }),
    });
    await commentSection.getByRole("textbox").fill(`${marker} ordinary comment`);
    const commentProbe = observeNextServerAction(state.recipientPage);
    const commentClickedAt = Date.now();
    const persistedComment = waitForComment(
      state.service,
      state.futureId,
      `${marker} ordinary comment`,
    );
    await commentSection.getByRole("button").last().click();
    const persistedCommentCard = commentCardForBody(commentSection, `${marker} ordinary comment`);
    await expect(persistedCommentCard)
      .toBeVisible({ timeout: WRITE_FEEDBACK_TIMEOUT_MS });
    const commentDomVisibleAt = Date.now();
    const persistedTopLevel = await persistedComment;
    expect(persistedTopLevel.row.parent_id).toBeNull();
    await reportActionTimeline(
      "capsule-comment",
      commentClickedAt,
      commentProbe,
      persistedTopLevel.confirmedAt,
      commentDomVisibleAt,
    );

    await persistedCommentCard.getByRole("button", { name: "回复" }).click();
    await commentSection.getByRole("textbox").fill(`${marker} reply`);
    const replyProbe = observeNextServerAction(state.recipientPage);
    const replyClickedAt = Date.now();
    const persistedReply = waitForComment(state.service, state.futureId, `${marker} reply`);
    await commentSection.getByRole("button").last().click();
    const persistedReplyCard = commentCardForBody(commentSection, `${marker} reply`);
    await expect(persistedReplyCard)
      .toBeVisible({ timeout: WRITE_FEEDBACK_TIMEOUT_MS });
    const replyDomVisibleAt = Date.now();
    const persistedReplyRow = await persistedReply;
    expect(persistedReplyRow.row.parent_id).toBe(persistedTopLevel.row.id);
    await reportActionTimeline(
      "capsule-reply",
      replyClickedAt,
      replyProbe,
      persistedReplyRow.confirmedAt,
      replyDomVisibleAt,
    );
    const refreshTriggeredAt = Date.now();
    await state.recipientPage.reload();
    await expect(commentCardForBody(commentSection, `${marker} ordinary comment`))
      .toBeVisible({ timeout: WRITE_FEEDBACK_TIMEOUT_MS });
    await expect(commentCardForBody(commentSection, `${marker} reply`))
      .toBeVisible({ timeout: WRITE_FEEDBACK_TIMEOUT_MS });
    console.log(JSON.stringify({
      flow: "capsule-reply-refresh",
      refreshTriggeredAt: new Date(refreshTriggeredAt).toISOString(),
      expectedReadPathDomVisibleMs: Date.now() - refreshTriggeredAt,
    }));
  });

});
