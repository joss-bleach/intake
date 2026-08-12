import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
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
