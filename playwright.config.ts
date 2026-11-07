import { defineConfig } from "@playwright/test";

const WEB = "http://localhost:3100";
const API = "http://localhost:3101";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://dropboard:dropboard@localhost:5432/dropboard";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: WEB },
  webServer: [
    {
      // Requires `pnpm --filter @dropboard/api build` and a migrated Postgres
      command: "node apps/api/dist/index.js",
      url: `${API}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "3101",
        DATABASE_URL,
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
        BETTER_AUTH_URL: WEB,
        WEB_ORIGIN: WEB,
      },
    },
    {
      command: "pnpm --filter @dropboard/web exec next start -p 3100",
      url: WEB,
      reuseExistingServer: !process.env.CI,
      env: { API_URL: API },
    },
  ],
});
