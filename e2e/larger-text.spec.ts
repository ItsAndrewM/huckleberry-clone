import type { Page } from "@playwright/test"
import { quickAction } from "./played-household.ts"
import { playEveryScreen } from "./played-screens.ts"
import { expect, test } from "./test.ts"

const LARGEST = `${(23 * 16) / 17}px`

const atLargestText = (page: Page) => page.addStyleTag({ content: `body { --text-unit: ${LARGEST} !important; }` })

const fontSizeOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) =>
      Number.parseFloat(element.ownerDocument.defaultView?.getComputedStyle(element).fontSize ?? ""),
    )

const scrollsSideways = (page: Page) =>
  page.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth")

test.use({ timezoneId: "America/Vancouver" })

test.beforeEach(async ({ page }) => {
  await playEveryScreen(page)
})

test("at iOS's usual text size, text keeps the sizes it has today", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Totals")).toBeVisible()
  expect(await fontSizeOf(page, "main h1")).toBe(24)
  expect(await fontSizeOf(page, "main .text-sm")).toBe(14)
})

test("at the largest standard size, text grows by about a third while boxes and the grid's labels keep theirs", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByText("Totals")).toBeVisible()
  await atLargestText(page)
  expect(await fontSizeOf(page, "main h1")).toBeCloseTo(32.47, 1)
  expect(await fontSizeOf(page, "main .text-sm")).toBeCloseTo(18.94, 1)
  const bottle = page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Bottle" })
  expect((await bottle.boundingBox())?.height).toBe(48)
  await page.goto("/history?date=2026-10-08")
  await atLargestText(page)
  const hourLabel = page.getByRole("region", { name: "The day by hour" }).locator("span[aria-hidden]").first()
  expect(
    await hourLabel.evaluate((element) =>
      Number.parseFloat(element.ownerDocument.defaultView?.getComputedStyle(element).fontSize ?? ""),
    ),
  ).toBe(11)
})

for (const [name, path] of [
  ["Today", "/"],
  ["History's Day view", "/history"],
  ["History's List view", "/history?view=list"],
  ["Trends", "/trends"],
  ["Growth", "/growth"],
  ["Settings", "/settings"],
  ["Recently deleted", "/settings/deleted"],
] as const) {
  test(`${name} doesn't scroll sideways at the largest standard size`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await atLargestText(page)
    expect(await scrollsSideways(page)).toBe(false)
  })
}

test("Today's sheets don't scroll sideways at the largest standard size", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Totals")).toBeVisible()
  await atLargestText(page)
  for (const sheet of ["Bottle", "Nursing", "Diaper", "Sleep"]) {
    await quickAction(page, sheet).click()
    const popup = page.locator('[data-slot="drawer-popup"]')
    await expect(popup).toBeVisible()
    expect(await popup.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false)
    expect(await scrollsSideways(page)).toBe(false)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
  }
})
