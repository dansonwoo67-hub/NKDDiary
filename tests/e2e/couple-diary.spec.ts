import { expect, test } from "@playwright/test";

const hasCoupleAccounts =
  Boolean(process.env.COUPLE_USER_A_EMAIL) &&
  Boolean(process.env.COUPLE_USER_A_PASSWORD) &&
  Boolean(process.env.COUPLE_USER_B_EMAIL) &&
  Boolean(process.env.COUPLE_USER_B_PASSWORD);

test.describe("couple diary", () => {
  test("login page offers sign-in but no registration", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "欢迎回到玫瑰星球" })).toBeVisible();
    await expect(page.getByRole("button", { name: "进入日记" })).toBeVisible();
    await expect(page.getByRole("link", { name: /注册|sign up/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /注册|sign up/i })).toHaveCount(0);
  });

  test("happy path: write, respond, open, comment", async ({ page, context }) => {
    test.skip(!hasCoupleAccounts, "Needs real Supabase project and seeded couple accounts.");

    const today = new Date().toISOString().slice(0, 10);

    await page.goto("/login");
    await page.getByLabel("邮箱").fill(process.env.COUPLE_USER_A_EMAIL!);
    await page.getByLabel("密码").fill(process.env.COUPLE_USER_A_PASSWORD!);
    await page.getByRole("button", { name: "进入日记" }).click();
    await page.getByRole("link", { name: "写信" }).click();
    await page.getByLabel("正文").fill("今天也想好好和你说话。");
    await page.getByLabel("今日七字信").fill("想见你");
    await page.getByRole("button", { name: "保存今天的信" }).click();
    await expect(page.getByText("今天的信保存好啦。")).toBeVisible();

    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(process.env.COUPLE_USER_B_EMAIL!);
    await page.getByLabel("密码").fill(process.env.COUPLE_USER_B_PASSWORD!);
    await page.getByRole("button", { name: "进入日记" }).click();
    await page.goto(`/letters/${today}`);
    await expect(page.getByText("想见你")).toBeVisible();
    await page.getByPlaceholder("三个字").fill("抱抱");
    await page.getByRole("button", { name: "展信" }).click();
    await expect(page.getByText("今天也想好好和你说话。")).toBeVisible();
    await page.getByText("今天也想好好和你说话。").selectText();
    await page.getByRole("button", { name: "评点选中文字" }).click();
    await page.getByPlaceholder("写下你的评点").fill("我也想听你慢慢说。");
    await page.getByRole("button", { name: "留下评点" }).click();
    await expect(page.getByText("评点已留下。")).toBeVisible();
  });

  test("locked letters expose no delete control", async ({ page }) => {
    test.skip(!hasCoupleAccounts, "Needs real Supabase project, seeded accounts, and a locked letter fixture.");

    await page.goto("/write");
    await expect(page.getByRole("button", { name: "已封存" })).toBeVisible();
    await expect(page.getByRole("button", { name: /删除/ })).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByText("删除")).toHaveCount(0);
  });
});
