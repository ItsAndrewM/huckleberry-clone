import type { BrowserContext, Page } from "@playwright/test"
import { expect, test } from "./test.ts"

test.use({ serviceWorkers: "allow" })

const ACCESS_EXPIRED_COOKIE = "bt-preview-access-expired"
const SIGNED_OUT_COOKIE = "bt-preview-signed-out"
const SLOW_PAGES_COOKIE = "bt-preview-slow-pages"
const SLOW_PAGE_MS = 15_000

const openWithSavedCopy = async (page: Page) => {
  await page.goto("/")
  await expect(page.getByText("Robin")).toBeVisible()
  await expect.poll(() => page.evaluate<boolean>("navigator.serviceWorker.controller !== null")).toBe(true)
}

const goOfflineLikeAPhone = async (page: Page, context: BrowserContext) => {
  await page.routeWebSocket(/\/api\/ws$/, (socket) => socket.close({ code: 1011, reason: "offline" }))
  await context.setOffline(true)
}

test("opens from its saved copy while offline, and says there's no connection", async ({ page, context }) => {
  await openWithSavedCopy(page)
  await goOfflineLikeAPhone(page, context)
  await page.reload()
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible()
  await expect(page.getByRole("alert").filter({ hasText: "No connection" })).toBeVisible()
})

test("opens its saved copy after about 3 s when the network is slow to answer", async ({ page, context, baseURL }) => {
  await openWithSavedCopy(page)
  await context.addCookies([{ name: SLOW_PAGES_COOKIE, value: "1", url: baseURL ?? "" }])
  const started = Date.now()
  await page.reload()
  await expect(page.getByText("Robin")).toBeVisible()
  expect(Date.now() - started).toBeLessThan(SLOW_PAGE_MS / 2)
})

test("opens its saved copy on a slow network even when the session has expired, and asks to sign in", async ({
  page,
  context,
  baseURL,
}) => {
  await openWithSavedCopy(page)
  await context.addCookies([
    { name: SLOW_PAGES_COOKIE, value: "1", url: baseURL ?? "" },
    { name: SIGNED_OUT_COOKIE, value: "1", url: baseURL ?? "" },
  ])
  const started = Date.now()
  await page.reload()
  await expect(page.getByRole("alert").filter({ hasText: "Sign in to continue" })).toBeVisible()
  expect(Date.now() - started).toBeLessThan(SLOW_PAGE_MS / 2)
})

test("says in Settings that this phone's offline copy is saved for this version", async ({ page }) => {
  await openWithSavedCopy(page)
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click()
  await expect(page.getByText("Saved for this version.")).toBeVisible()
})

test("opens any tab's address from its saved copy while offline", async ({ page, context }) => {
  await openWithSavedCopy(page)
  await goOfflineLikeAPhone(page, context)
  await page.goto("/history")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible()
})

test("never answers the household's API from the saved copy", async ({ page, context }) => {
  await openWithSavedCopy(page)
  const saved = await page.evaluate<string[]>(
    "caches.keys().then((names) => Promise.all(names.map((name) => caches.open(name).then((cache) => cache.keys())))).then((lists) => lists.flat().map((request) => new URL(request.url).pathname))",
  )
  expect(saved).toContain("/")
  expect(saved.filter((path) => path.startsWith("/api/"))).toEqual([])
  await goOfflineLikeAPhone(page, context)
  expect(await page.evaluate<string>("fetch('/api/me').then(() => 'answered', () => 'failed')")).toBe("failed")
})

test("leaves Sign in to the network, so offline it fails rather than opening the saved app", async ({
  page,
  context,
}) => {
  await openWithSavedCopy(page)
  await goOfflineLikeAPhone(page, context)
  await expect(page.goto("/api/login?return=%2F")).rejects.toThrow()
})

test("sends an expired session to Access's sign-in, not the saved app", async ({ page, context, baseURL }) => {
  await openWithSavedCopy(page)
  await page.route("https://access.example.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Access sign-in</h1>" }),
  )
  await context.addCookies([{ name: ACCESS_EXPIRED_COOKIE, value: "1", url: baseURL ?? "" }])
  await page.reload()
  await expect(page.getByRole("heading", { name: "Access sign-in" })).toBeVisible()
})

test("opens the app online even when its saved copy can't be read", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "only Chromium lets a test reach inside the service worker")
  await openWithSavedCopy(page)
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
  await worker.evaluate(
    "caches.open = caches.match = () => Promise.reject(new DOMException('The operation failed for an unknown transient reason.', 'UnknownError'))",
  )
  await page.reload()
  await expect(page.getByText("Robin")).toBeVisible()
})
