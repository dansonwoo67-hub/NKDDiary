import { defineConfig, devices } from "@playwright/test";
import { RESPONSIVE_VIEWPORTS } from "./scripts/playwright-e2e-config";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-375",
      use: { ...devices["Pixel 7"], viewport: RESPONSIVE_VIEWPORTS["mobile-375"] },
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: RESPONSIVE_VIEWPORTS["tablet-768"], hasTouch: true },
    },
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: RESPONSIVE_VIEWPORTS["desktop-1440"] },
    },
  ],
});
