import type { Locator, Page } from "@playwright/test"
import { quickAction } from "./played-household.ts"
import { playEveryScreen } from "./played-screens.ts"
import { expect, test } from "./test.ts"

const LARGEST = `${(23 * 16) / 17}px`

const STILL = "*, *::before, *::after { transition: none !important; animation: none !important; }"

const atLargestText = (page: Page) =>
  page.addStyleTag({ content: `${STILL} body { --text-unit: ${LARGEST} !important; }` })

const fontSizeOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) =>
      Number.parseFloat(element.ownerDocument.defaultView?.getComputedStyle(element).fontSize ?? ""),
    )

const scrollsSideways = (page: Page) =>
  page.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth")

const overhangOf = (section: Locator) =>
  section.evaluate((element) => {
    const edge = element.getBoundingClientRect().right
    return Math.max(
      ...[...element.querySelectorAll("button")].map((button) => button.getBoundingClientRect().right - edge),
    )
  })

const roomAround = (link: Locator) =>
  link.evaluate((element) => {
    const view = element.ownerDocument.defaultView
    let box = element.parentElement
    while (box !== null && view?.getComputedStyle(box).overflowX === "visible") box = box.parentElement
    const inner = element.getBoundingClientRect()
    const outer = box?.getBoundingClientRect()
    return { left: inner.left - (outer?.left ?? Number.NaN), bottom: (outer?.bottom ?? Number.NaN) - inner.bottom }
  })

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

for (const [name, path] of [
  ["Trends by week", "/trends"],
  ["Trends by month", "/trends?view=month"],
  ["Growth", "/growth"],
] as const) {
  test(`${name}'s table, once opened, doesn't make the page scroll sideways at the largest standard size`, async ({
    page,
  }) => {
    await page.goto(path)
    await page.getByText("Show as a table", { exact: true }).click()
    await expect(page.getByRole("table")).toBeVisible()
    await atLargestText(page)
    expect(await scrollsSideways(page)).toBe(false)
  })
}

test("the box a table scrolls in leaves room around its links for their focus rings", async ({ page }) => {
  await page.goto("/trends")
  await page.getByText("Show as a table", { exact: true }).click()
  const links = page.getByRole("table").getByRole("link")
  await expect(links.first()).toBeVisible()
  expect((await roomAround(links.first())).left).toBeGreaterThanOrEqual(3)
  expect((await roomAround(links.last())).bottom).toBeGreaterThanOrEqual(3)
})

for (const [verb, script] of [
  ["Share", 'Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: () => true })'],
  ["Download", 'Reflect.deleteProperty(Navigator.prototype, "canShare")'],
] as const) {
  test(`Settings' Export buttons, saying ${verb}, stay inside the page's margins at the largest standard size`, async ({
    page,
  }) => {
    await page.addInitScript(script)
    await page.goto("/settings")
    await expect(page.getByRole("button", { name: `${verb} JSON` })).toBeVisible()
    await atLargestText(page)
    const section = page.locator("section", { has: page.getByRole("heading", { name: "Export" }) })
    expect(await overhangOf(section)).toBeLessThanOrEqual(0.5)
    expect(await scrollsSideways(page)).toBe(false)
  })
}
