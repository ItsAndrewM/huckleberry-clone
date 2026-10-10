import { expect, type Page, test } from "@playwright/test"

const background = (page: Page) => page.evaluate<string>("getComputedStyle(document.body).backgroundColor")

const themeButton = (page: Page, name: string) => page.getByRole("button", { name, exact: true })

test("follows the phone's light or dark setting until a theme is chosen", async ({ page }) => {
  await page.goto("/settings")
  await themeButton(page, "Light").click()
  const light = await background(page)
  await themeButton(page, "Dark").click()
  const dark = await background(page)
  expect(dark).not.toBe(light)

  await themeButton(page, "System").click()
  await expect(themeButton(page, "System")).toHaveAttribute("aria-pressed", "true")
  await page.emulateMedia({ colorScheme: "dark" })
  expect(await background(page)).toBe(dark)
  await page.emulateMedia({ colorScheme: "light" })
  expect(await background(page)).toBe(light)
})

test("keeps a chosen theme over the phone's setting, from the first paint after a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/settings")
  const light = await background(page)
  await themeButton(page, "Dark").click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

  await page.route("**/assets/*.js", (route) => route.abort())
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  expect(await background(page)).not.toBe(light)
})

test("still switches theme for the page when the browser blocks storage", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(
    'Object.defineProperty(window, "localStorage", { get: () => { throw new DOMException("The operation is insecure.", "SecurityError") } })',
  )
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/settings")
  await expect(themeButton(page, "System")).toHaveAttribute("aria-pressed", "true")
  const light = await background(page)

  await themeButton(page, "Dark").click()
  await expect(themeButton(page, "Dark")).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  expect(await background(page)).not.toBe(light)
  expect(errors).toEqual([])
})

test("goes back to the phone's setting when System is chosen", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/settings")
  const light = await background(page)
  await themeButton(page, "Dark").click()
  await themeButton(page, "System").click()
  await expect(page.locator("html")).not.toHaveAttribute("data-theme")
  expect(await background(page)).toBe(light)
  await page.reload()
  await expect(themeButton(page, "System")).toHaveAttribute("aria-pressed", "true")
})
