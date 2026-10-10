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

  await banner.getByRole("link", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/history")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("signs in back to the tab the parent moved to after the prompt appeared", async ({ page, context, baseURL }) => {
  await page.goto("/history")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible()
  await context.addCookies([{ name: SIGNED_OUT_COOKIE, value: "1", url: baseURL ?? "" }])
  await page.reload()
  const signIn = page
    .getByRole("alert")
    .filter({ hasText: "Sign in to continue" })
    .getByRole("link", { name: "Sign in" })
  await expect(signIn).toHaveAttribute("href", "/api/login?return=%2Fhistory")

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Growth" }).click()
  await expect(page.getByRole("heading", { name: "Growth", level: 1 })).toBeVisible()
  await expect(signIn).toHaveAttribute("href", "/api/login?return=%2Fgrowth")
  await signIn.click()
  await expect(page).toHaveURL("/growth")
  await expect(page.getByRole("heading", { name: "Growth", level: 1 })).toBeVisible()
})

test("treats the household refusing the caregiver as signed out too", async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: '{"_tag":"Unauthorized"}' }),
  )
  await page.goto("/")
  await expect(page.getByRole("alert").filter({ hasText: "Sign in to continue" })).toBeVisible()
})

test("doesn't ask to sign in when the household is briefly unavailable, and tries again", async ({ page }) => {
  let answered = 0
  let releaseRetry: () => void = () => undefined
  const retryHeld = new Promise<void>((resolve) => {
    releaseRetry = resolve
  })
  await page.route("**/api/me", async (route) => {
    answered += 1
    if (answered === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"_tag":"ServiceUnavailable"}' })
    }
    await retryHeld
    return route.continue()
  })
  await page.goto("/")
  await expect.poll(() => answered).toBe(2)
  await expect(page.getByRole("alert")).toHaveCount(0)
  releaseRetry()
  await expect(page.getByText("Robin")).toBeVisible()
  expect(answered).toBe(2)
})
