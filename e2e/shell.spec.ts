import { expect, test } from "@playwright/test"

test("serves the app shell", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Baby tracker" })).toBeVisible()
})

test("serves the shell for a deep client route (SPA fallback, D1)", async ({ page }) => {
  await page.goto("/history")
  await expect(page.getByRole("heading", { name: "Baby tracker" })).toBeVisible()
})

test("routes /api/* to the Worker, which denies it until M1.4", async ({ request }) => {
  const res = await request.get("/api/me")
  expect(res.status()).toBe(401)
  expect(await res.json()).toEqual({ _tag: "Unauthorized" })
})
