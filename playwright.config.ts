import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./e2e/auth-setup";

const PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  // Signs a test user in once (see e2e/auth-setup.ts) so every test starts
  // past the sign-in gate added in #87, instead of repeating OTP UI per test.
  globalSetup: "./e2e/auth-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    storageState: STORAGE_STATE_PATH,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Two independent servers, each with its own readiness check — the smoke
  // test's ping depends on both, and waiting on the client port alone
  // (:5173) doesn't guarantee the tRPC server (:3001) has finished starting.
  webServer: [
    {
      command: "pnpm dev:client",
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev:server",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
