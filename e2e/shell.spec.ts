import { expect, test } from "@playwright/test"

test("serves the app shell", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Baby tracker" })).toBeVisible()
})

test("serves the shell for a deep client route (SPA fallback, D1)", async ({ page }) => {
  await page.goto("/history")
  await expect(page.getByRole("heading", { name: "Baby tracker" })).toBeVisible()
})

test("routes /api/* fetches to the Worker, which denies them until M1.4", async ({ request }) => {
  const res = await request.get("/api/me")
  expect(res.status()).toBe(401)
  expect(await res.json()).toEqual({ _tag: "Unauthorized" })
})

test("routes /api/* navigations to the Worker, not the SPA shell (run_worker_first, D1)", async ({ page }) => {
  const res = await page.goto("/api/me")
  expect(res?.status()).toBe(401)
  expect(await res?.json()).toEqual({ _tag: "Unauthorized" })
})
