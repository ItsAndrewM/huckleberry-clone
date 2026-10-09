import { expect, test } from "@playwright/test"

test("serves the app shell", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Baby tracker" })).toBeVisible()
})

test("serves the shell for a deep client route (SPA fallback, D1)", async ({ page }) => {
  await page.goto("/history")
  await expect(page.getByRole("heading", { name: "Baby tracker" })).toBeVisible()
})

test("sends signed-in /api/* fetches through to the household, which has no routes until M1.5", async ({ request }) => {
  const res = await request.get("/api/me")
  expect(res.status()).toBe(404)
  expect(await res.json()).toEqual({ _tag: "NotFound" })
})

test("routes /api/* navigations to the Worker, not the SPA shell (run_worker_first, D1)", async ({ page }) => {
  const res = await page.goto("/api/me")
  expect(res?.status()).toBe(404)
  expect(await res?.json()).toEqual({ _tag: "NotFound" })
})

test("refuses the access.dev caregiver on admin routes", async ({ request }) => {
  const res = await request.post("/api/admin/caregiver/disable")
  expect(res.status()).toBe(401)
  expect(await res.json()).toEqual({ _tag: "Unauthorized" })
})

test("signs in back to the page the parent was on", async ({ page }) => {
  await page.goto("/api/login?return=/history")
  await expect(page).toHaveURL("/history")
  await expect(page.getByRole("heading", { name: "Baby tracker" })).toBeVisible()
})

test("signs in to this site only, even with a tab hidden in the return path", async ({ page }) => {
  await page.goto(`/api/login?${new URLSearchParams({ return: "/\t/evil.test" })}`)
  await expect(page).toHaveURL("/")
})
