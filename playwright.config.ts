import { defineConfig, devices } from "@playwright/test"

const PORT = 4173
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  projects: [
    { name: "webkit", use: { ...devices["iPhone 15"] } },
    { name: "chromium", use: { ...devices["iPhone 15"], browserName: "chromium" } },
  ],
  webServer: {
    command: `pnpm --filter @bt/web build && pnpm --filter @bt/web preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
})
