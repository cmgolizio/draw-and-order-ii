import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  testMatch: "redesign.spec.js",
  outputDir: "test-results/classic-runs",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3200",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- -p 3200 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3200",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
