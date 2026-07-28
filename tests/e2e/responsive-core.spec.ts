import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const hasAccount = Boolean(process.env.COUPLE_USER_A_EMAIL && process.env.COUPLE_USER_A_PASSWORD);

async function signIn(page: Page) {
  await page.goto(new URL("/login", baseUrl).toString());
  await page.getByLabel("邮箱").fill(process.env.COUPLE_USER_A_EMAIL!);
  await page.getByLabel("密码").fill(process.env.COUPLE_USER_A_PASSWORD!);
  await page.getByRole("button", { name: "进入日记" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test.describe("responsive core release", () => {
  test("private login fits the release viewport and has no registration", async ({ page }) => {
    await page.goto(new URL("/login", baseUrl).toString());
    await expect(page.getByRole("heading", { name: "欢迎回到我们的空间" })).toBeVisible();
    await expect(page.getByRole("button", { name: "进入日记" })).toBeVisible();
    await expect(page.getByRole("link", { name: /注册|sign up/i })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("all five signed-in product areas keep navigation usable without overflow", async ({ page }) => {
    test.skip(!hasAccount, "A seeded couple account is required for signed-in responsive acceptance.");
    await signIn(page);

    for (const route of ["/", "/memories", "/journal", "/calendar", "/settings"]) {
      await page.goto(new URL(route, baseUrl).toString());
      const navigation = page.getByRole("navigation", { name: "主导航" });
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole("link")).toHaveCount(5);
      await expect(navigation.getByRole("link", { name: "心情" })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }
  });
});
