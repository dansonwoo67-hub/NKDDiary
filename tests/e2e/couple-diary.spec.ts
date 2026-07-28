import { expect, test } from "@playwright/test";

test.describe("unauthenticated smoke", () => {
  test("login is available and registration is absent", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "欢迎回到我们的空间" })).toBeVisible();
    await expect(page.getByRole("button", { name: "进入日记" })).toBeVisible();
    await expect(page.getByRole("link", { name: /注册|sign up/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /注册|sign up/i })).toHaveCount(0);
  });
});
