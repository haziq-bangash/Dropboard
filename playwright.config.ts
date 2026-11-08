import { defineConfig, devices } from "@playwright/test";

// Uncommon ports so a local run never reuses some other project's dev server
const WEB = "http://localhost:4310";
const API = "http://localhost:4311";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://dropboard:dropboard@localhost:5432/dropboard";

// `CROSS_BROWSER=1` also runs the parts of the suite that depend on the browser (reading spreadsheets as a stream, the database in the
// page, charts, layout on a small screen) in Firefox, WebKit (Safari's engine) and a phone-sized Chromium. The rest of the suite is
// about the server and runs in Chromium only.
const CROSS = !!process.env.CROSS_BROWSER;
const BROWSER_TESTS = /(large-files|starters|story|people-and-text|insights).spec.ts/;
const BIG_FILE = /1,100,000|too big for the memory|falls back to a random sample/;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // three browsers at once make each other slow enough to miss timeouts that pass alone
  ...(CROSS ? { workers: 2 } : {}),
  use: { baseURL: WEB },
  projects: CROSS
    ? [
        { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: BROWSER_TESTS, grepInvert: BIG_FILE },
        { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: BROWSER_TESTS, grepInvert: BIG_FILE },
        { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: BROWSER_TESTS, grepInvert: BIG_FILE },
      ]
    : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Requires `pnpm --filter @dropboard/api build` and a migrated Postgres
      command: "node apps/api/dist/index.js",
      url: `${API}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "4311",
        DATABASE_URL,
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
        BETTER_AUTH_URL: WEB,
        WEB_ORIGIN: WEB,
      },
    },
    {
      command: "pnpm --filter @dropboard/web exec next start -p 4310",
      url: WEB,
      reuseExistingServer: !process.env.CI,
      env: { API_URL: API },
    },
  ],
});
