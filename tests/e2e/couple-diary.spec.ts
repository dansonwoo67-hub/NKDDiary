import { expect, test } from "@playwright/test";

const mutationSuiteReady =
  process.env.E2E_ALLOW_MUTATIONS === "I_UNDERSTAND_TEST_DATA_WILL_BE_DELETED" &&
  process.env.E2E_MUTATIONS_SUPERVISED === "1" &&
  Boolean(process.env.E2E_ACTIVE_SUPABASE_URL) &&
  Boolean(process.env.E2E_TEST_USER_A_EMAIL) &&
  Boolean(process.env.E2E_TEST_USER_A_PASSWORD) &&
  Boolean(process.env.E2E_TEST_USER_B_EMAIL) &&
  Boolean(process.env.E2E_TEST_USER_B_PASSWORD);

test.describe("couple diary", () => {
  test("login page offers sign-in but no registration", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "欢迎回到玫瑰星球" })).toBeVisible();
    await expect(page.getByRole("button", { name: "进入日记" })).toBeVisible();
    await expect(page.getByRole("link", { name: /注册|sign up/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /注册|sign up/i })).toHaveCount(0);
  });

  test.describe("guarded mutation flows", () => {
    test.describe.configure({ mode: "serial" });

    test.beforeEach(({}, testInfo) => {
      test.skip(!mutationSuiteReady, "Mutation E2E requires the supervised dedicated test backend.");
      test.skip(testInfo.project.name !== "chromium", "Mutation E2E runs only in the desktop Chromium project.");
    });

    test("daily letter flushes its final line before publishing", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("邮箱").fill(process.env.E2E_TEST_USER_A_EMAIL!);
      await page.getByLabel("密码").fill(process.env.E2E_TEST_USER_A_PASSWORD!);
      await page.getByRole("button", { name: "进入日记" }).click();
      await page.getByRole("button", { name: "写一封信" }).click();
      await page.getByRole("button", { name: "写今天的信" }).click();
      for (let step = 0; step < 3; step += 1) {
        await page.getByRole("button", { name: "选好了，继续" }).click();
      }
      await page.getByLabel("称呼").fill("亲爱的");
      await page.getByRole("button", { name: "开始写信" }).click();
      await page.getByLabel("编辑信件正文").fill("今天也想好好和你说话。");
      await page.getByLabel("总而言之，我想跟你说").fill("想见你");
      await page.getByRole("button", { name: "寄出" }).click();
      await expect(page.getByText("寄出后不能修改，24小时内可以撤回。")).toBeVisible();
      await page.getByRole("button", { name: "确认寄出" }).click();
      await expect(page.getByRole("link", { name: "查看今天的信" })).toBeVisible();
    });

    test("future letter skips the ritual and locks after scheduling", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("邮箱").fill(process.env.E2E_TEST_USER_B_EMAIL!);
      await page.getByLabel("密码").fill(process.env.E2E_TEST_USER_B_PASSWORD!);
      await page.getByRole("button", { name: "进入日记" }).click();
      await page.getByRole("button", { name: "写一封信" }).click();
      await page.getByRole("button", { name: "写给未来" }).click();
      await page.getByLabel("送达日期").fill("2099-08-01T08:30");
      await page.getByRole("button", { name: "确认送达时间" }).click();
      await page.getByLabel("称呼").fill("未来的你");
      await page.getByRole("button", { name: "开始写信" }).click();
      await page.getByLabel("编辑信件正文").fill("等到那一天，再读这封信。");
      await page.getByLabel("总而言之，我想跟你说").fill("未来见");
      await page.getByRole("button", { name: "放进时间胶囊" }).click();
      await expect(page.getByText(/将在 2099年8月1日 08:30 自动送达/)).toBeVisible();
      await page.getByRole("button", { name: "确认放进时间胶囊" }).click();
      await expect(page.getByLabel("编辑信件正文")).toHaveCount(0);
    });

    test("locked letters expose no delete control", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("邮箱").fill(process.env.E2E_TEST_USER_A_EMAIL!);
      await page.getByLabel("密码").fill(process.env.E2E_TEST_USER_A_PASSWORD!);
      await page.getByRole("button", { name: "进入日记" }).click();
      await page.goto("/write");
      await expect(page.getByRole("button", { name: "已封存" })).toBeVisible();
      await expect(page.getByRole("button", { name: /删除/ })).toHaveCount(0);
      await page.goto("/");
      await expect(page.getByText("删除")).toHaveCount(0);
    });
  });
});
