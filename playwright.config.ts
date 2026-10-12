import { defineConfig, devices } from "@playwright/test"

const PORT = 4173
const CI = Boolean(process.env.CI)
const ORIGIN = `http://localhost:${PORT}`
const PHONE_THAT_DISMISSED_THE_INSTALL_CARD = {
  cookies: [],
  origins: [{ origin: ORIGIN, localStorage: [{ name: "bt.install-card", value: "dismissed" }] }],
}

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: ORIGIN,
    trace: "on-first-retry",
    serviceWorkers: "block",
    storageState: PHONE_THAT_DISMISSED_THE_INSTALL_CARD,
  },
  projects: [
    { name: "webkit", use: { ...devices["iPhone 15"] } },
    { name: "chromium", use: { ...devices["iPhone 15"], browserName: "chromium" } },
  ],
  webServer: {
    command: `CLOUDFLARE_ENV=local pnpm --filter @bt/web build && pnpm --filter @bt/web preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
})
