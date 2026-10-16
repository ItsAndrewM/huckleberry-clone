import type { Locator, Page } from "@playwright/test"
import { OPENED_SHEETS } from "./opened-sheets.ts"
import { playEveryScreen, SCREENS } from "./played-screens.ts"
import { STILL } from "./still.ts"
import { expect, test } from "./test.ts"

const LARGEST = `${(23 * 16) / 17}px`

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

const sheetScrollsSideways = async (page: Page) => {
  const scroller = page.locator('[data-slot="drawer-popup"] .overflow-y-auto')
  await expect(scroller).toHaveCount(1)
  return scroller.evaluate((element) => element.scrollWidth > element.clientWidth)
}

const atTheUsualSize = (page: Page) => page.addStyleTag({ content: STILL })

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

const IOS_BODY_SIZES = [14, 15, 16, 17, 19, 21, 23, 28]

const iphoneTextUnits = (sizes: ReadonlyArray<number>) => `(() => {
  const inside = (rules) => [...rules].flatMap((rule) => [rule, ...(rule.cssRules ? inside(rule.cssRules) : [])])
  const rule = [...document.styleSheets]
    .flatMap((sheet) => inside(sheet.cssRules))
    .filter((found) => found instanceof CSSSupportsRule && found.conditionText.includes("-webkit-touch-callout"))
    .flatMap((supports) => [...supports.cssRules])
    .find((inner) => inner.selectorText === "body" && inner.style.getPropertyValue("--text-unit") !== "")
  const value = rule === undefined ? "" : rule.style.getPropertyValue("--text-unit")
  return ${JSON.stringify(sizes)}.map((size) => {
    const probe = document.createElement("div")
    probe.style.fontSize = size + "px"
    probe.style.setProperty("--text-unit", value)
    document.body.append(probe)
    const unit = Number.parseFloat(getComputedStyle(probe).getPropertyValue("--text-unit"))
    probe.remove()
    return Math.round(unit * 100) / 100
  })
})()`

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

test("on an iPhone, the text unit grows from iOS's body size, never drops below today's 16 px, and stops at the largest standard size", async ({
  page,
}) => {
  await page.goto("/")
  expect(await page.evaluate<number[]>(iphoneTextUnits(IOS_BODY_SIZES))).toEqual([
    16, 16, 16, 16, 17.88, 19.76, 21.65, 21.65,
  ])
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

for (const { name, path, ready } of SCREENS) {
  test(`${name} doesn't scroll sideways at the largest standard size`, async ({ page }) => {
    await page.goto(path)
    await expect(ready(page)).toBeVisible()
    await atLargestText(page)
    expect(await scrollsSideways(page)).toBe(false)
  })
}

for (const [size, settle] of [
  ["the usual size", atTheUsualSize],
  ["the largest standard size", atLargestText],
] as const) {
  for (const { name, dialog, path, ready, open } of OPENED_SHEETS) {
    test(`${name} doesn't scroll sideways at ${size}`, async ({ page }) => {
      await page.goto(path)
      await expect(ready(page)).toBeVisible()
      await settle(page)
      await open(page)
      await expect(page.getByRole("dialog")).toHaveCount(1)
      await expect(page.getByRole("dialog", { name: dialog })).toBeVisible()
      expect(await sheetScrollsSideways(page)).toBe(false)
      expect(await scrollsSideways(page)).toBe(false)
    })
  }
}

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
