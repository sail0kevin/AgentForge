import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3110",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3110",
    url: "http://127.0.0.1:3110",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_AUTH_MODE: "local",
      ENCRYPTION_MASTER_KEY: "playwright-local-encryption-key",
    },
  },
});
