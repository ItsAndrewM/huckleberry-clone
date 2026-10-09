import { expect, test } from "@playwright/test"

const SIGNED_OUT_COOKIE = "bt-preview-signed-out"

test("shows No connection while the phone is offline, and clears it once back online", async ({ page, context }) => {
  await page.goto("/")
  await expect(page.getByText("Robin")).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByRole("alert").filter({ hasText: "No connection" })).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText("No connection")).toBeHidden()
})

test("asks to sign in once Access has signed the parent out, and signs in back to the same page", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/history")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible()
  await context.addCookies([{ name: SIGNED_OUT_COOKIE, value: "1", url: baseURL ?? "" }])
  await page.reload()
  const banner = page.getByRole("alert").filter({ hasText: "Sign in to continue" })
  await expect(banner).toBeVisible()

  await banner.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/history")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("treats the household refusing the caregiver as signed out too", async ({ page }) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: '{"_tag":"Unauthorized"}' }),
  )
  await page.goto("/")
  await expect(page.getByRole("alert").filter({ hasText: "Sign in to continue" })).toBeVisible()
})

test("doesn't ask to sign in when the household is briefly unavailable, and tries again", async ({ page }) => {
  let answered = 0
  await page.route("**/api/me", (route) => {
    answered += 1
    return answered === 1
      ? route.fulfill({ status: 503, contentType: "application/json", body: '{"_tag":"ServiceUnavailable"}' })
      : route.continue()
  })
  await page.goto("/")
  await expect(page.getByText("Robin")).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
  expect(answered).toBe(2)
})
