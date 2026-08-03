import { defineConfig } from "@playwright/test";

if (process.env.AGENTFORGE_E2E_ISOLATED !== "1" || !process.env.DATABASE_URL) {
  throw new Error("Run Playwright through npm run test:e2e so it uses an isolated database.");
}

const shouldManageWebServer = process.env.AGENTFORGE_E2E_MANAGED_SERVER !== "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3110",
    trace: "retain-on-failure",
  },
  ...(shouldManageWebServer
    ? {
        webServer: {
          command: "node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3110",
          url: "http://127.0.0.1:3110",
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            APP_AUTH_MODE: process.env.APP_AUTH_MODE ?? "local",
            SESSION_SECRET: process.env.SESSION_SECRET ?? "agentforge-playwright-session-secret-at-least-32-chars",
            DATABASE_URL: process.env.DATABASE_URL,
            ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY ?? "agentforge-playwright-encryption-key",
            AGENTFORGE_E2E_ISOLATED: "1",
            PROVIDER_TIMEOUT_MS: "300",
          },
        },
      }
    : {}),
});