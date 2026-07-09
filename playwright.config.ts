import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 8 smoke tests. Fully self-contained: a mock backend (e2e/mock-backend.mjs)
 * stands in for Supabase and the Anthropic API, and the app runs against it in
 * dev mode with keyless Turnstile (widget hidden, verification skipped).
 */

const MOCK_PORT = 43117;
const MOCK_ORIGIN = `http://127.0.0.1:${MOCK_PORT}`;
const APP_PORT = 3100;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The specs share one mock backend and one dev server; keep them serial.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: APP_ORIGIN,
    trace: "retain-on-failure",
    // Some sandboxes pre-install a Chromium that doesn't match this
    // @playwright/test pin; point at it instead of re-downloading.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node e2e/mock-backend.mjs`,
      url: `${MOCK_ORIGIN}/health`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_BACKEND_PORT: String(MOCK_PORT) },
    },
    {
      // Prod build: dev-mode hydration timing is not what we're smoking out.
      command: `npx next build && npx next start -p ${APP_PORT}`,
      url: APP_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: MOCK_ORIGIN,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "mock-publishable-key",
        SUPABASE_SECRET_KEY: "mock-secret-key",
        ANTHROPIC_API_KEY: "mock-anthropic-key",
        ANTHROPIC_BASE_URL: `${MOCK_ORIGIN}/anthropic`,
      },
    },
  ],
});