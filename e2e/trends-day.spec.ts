import type { Locator, Page } from "@playwright/test"
import { busyDay, emptyDay, playHistory } from "./played-day.ts"
import { datesFrom, NOW, openTrends, periodOf, playTrends, TRENDS_DAYS } from "./played-period.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const playDays = async (page: Page) => {
  const { played, andrew, emily } = await playHistory(page, [])
  await playTrends(page, {
    weeks: {
      "2026-W39": periodOf(datesFrom("2026-09-21", 7), TRENDS_DAYS),
      "2026-W40": periodOf(datesFrom("2026-09-28", 7), TRENDS_DAYS),
      "2026-W41": periodOf(datesFrom("2026-10-05", 7), TRENDS_DAYS),
    },
    months: {},
  })
  played.days.push(busyDay(andrew, emily), emptyDay("2026-10-06"), emptyDay("2026-10-01"))
}

const chart = (page: Page, name: string) => page.getByRole("region", { name })
const days = (page: Page) => page.getByRole("navigation", { name: "days" })
const pickedDay = (page: Page) => page.getByRole("main").getByRole("status").first()
const historyLink = (page: Page) => page.getByRole("link", { name: "Open in History" })

const spareWidth = (link: Locator) =>
  link.evaluate((anchor) => {
    const contents = anchor.ownerDocument.createRange()
    contents.selectNodeContents(anchor)
    return anchor.getBoundingClientRect().width - contents.getBoundingClientRect().width
  })

const overhangOf = async (table: Locator, day: string) => {
  const row = table.getByRole("row", { name: day })
  const [link, around] = await Promise.all([row.getByRole("link").boundingBox(), row.boundingBox()])
  if (link === null || around === null) return Number.NaN
  return Math.max(around.y - link.y, link.y + link.height - (around.y + around.height))
}

test("climbs through today so far, against her usual day over the seven days before", async ({ page }) => {
  await playDays(page)
  await openTrends(page, "?view=day")
  await expect(days(page).getByRole("heading")).toHaveText("Fri, Oct 9")
  await expect(days(page)).toContainText("Today, so far")
  await expect(chart(page, "Feeds started")).toContainText("4 so far")
  await expect(chart(page, "Feeds started")).toContainText("Usual 8.2, over 6 days")
  await expect(chart(page, "Bottles")).toContainText("150 mL so far")
  await expect(chart(page, "Bottles").locator('[data-ts-key^="usual:"]').first()).toBeAttached()
  await expect(chart(page, "Bottles").locator('[data-ts-key^="so-far:"]').first()).toBeAttached()
  await expect(chart(page, "Bottles").getByRole("img")).toHaveAccessibleName("Bottles through the day, in mL")
  await expect(chart(page, "Feeds started").getByRole("img")).toHaveAccessibleName("Feeds started through the day")
})

test("says there's no usual day yet when nothing was logged in the seven days before, and draws no line through a day with nothing logged", async ({
  page,
}) => {
  await playDays(page)
  await openTrends(page, "?view=day&date=2026-10-01")
  await expect(chart(page, "Diapers")).toContainText("No entries")
  await expect(chart(page, "Diapers")).toContainText("No usual day yet")
  await expect(chart(page, "Diapers").locator('[data-ts-key^="usual:"]')).toHaveCount(0)
  await expect(page.getByRole("main").locator('text[data-ts-key^="x-tick-label"]')).toHaveCount(25)
  await expect(page.getByRole("main").locator('[data-ts-key^="so-far:"]')).toHaveCount(0)
})

test("lengthens today's line as the minutes pass", async ({ page }) => {
  await playDays(page)
  await page.clock.install({ time: NOW })
  await page.goto("/trends?view=day")
  const line = chart(page, "Bottles").locator('[data-ts-key^="so-far:"]').first()
  const lengthOf = () => line.evaluate((mark) => mark.getBoundingClientRect().width)
  await expect(line).toBeAttached()
  const before = await lengthOf()
  await page.clock.fastForward("01:00:00")
  await expect.poll(lengthOf).toBeGreaterThan(before + 1)
})

test("loads the day on Try again, once the household answers", async ({ page }) => {
  await playDays(page)
  let refusing = true
  await page.route(/\/api\/days\/2026-10-09$/u, (route) =>
    refusing ? route.fulfill({ status: 404 }) : route.fallback(),
  )
  await openTrends(page, "?view=day")
  await expect(page.getByText("This day couldn't be loaded.")).toBeVisible()
  refusing = false
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(chart(page, "Feeds started")).toContainText("4 so far")
})

test("says her usual day couldn't be loaded while still charting today, and draws its line on Try again", async ({
  page,
}) => {
  await playDays(page)
  let refusing = true
  await page.route("**/api/weeks/2026-W40", (route) => (refusing ? route.fulfill({ status: 404 }) : route.fallback()))
  await openTrends(page, "?view=day")
  const main = page.getByRole("main")
  const message = main.getByText("Her usual day couldn't be loaded.")
  await expect(message).toBeVisible()
  await expect(chart(page, "Feeds started")).toContainText("4 so far")
  await expect(main.locator('[data-ts-key^="usual:"]')).toHaveCount(0)
  refusing = false
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(message).toHaveCount(0)
  await expect(chart(page, "Feeds started")).toContainText("Usual 8.2, over 6 days")
  await expect(chart(page, "Bottles").locator('[data-ts-key^="usual:"]').first()).toBeAttached()
})

test("opens the day it shows in History", async ({ page }) => {
  await playDays(page)
  await openTrends(page, "?view=day")
  await expect(historyLink(page)).toBeVisible()
  expect(await spareWidth(historyLink(page))).toBeLessThan(1)
  await historyLink(page).click()
  await expect(page).toHaveURL(/\/history$/u)
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("heading")).toHaveText("Fri, Oct 9")
})

test("opens the picked day in History, and switches to its Day view", async ({ page }) => {
  await playDays(page)
  await openTrends(page)
  await chart(page, "Diapers").getByRole("img").focus()
  await expect(historyLink(page)).toHaveCount(0)
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Enter")
  await expect(historyLink(page)).toHaveAttribute("href", /\/history\?date=2026-10-06$/u)
  expect(await spareWidth(historyLink(page))).toBeLessThan(1)
  await page.getByRole("button", { name: "Day" }).click()
  await expect(page).toHaveURL(/\/trends\?view=day&date=2026-10-06$/u)
  await historyLink(page).click()
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("heading")).toHaveText("Tue, Oct 6")
})

test("opens History's today, with no date, from the picked line when today is picked", async ({ page }) => {
  await playDays(page)
  await openTrends(page)
  await chart(page, "Diapers").getByRole("img").focus()
  for (const key of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"]) await page.keyboard.press(key)
  await expect(pickedDay(page)).toHaveText("Fri, Oct 9")
  await expect(historyLink(page)).toHaveAttribute("href", /\/history$/u)
})

test("opens a day in History from the table", async ({ page }) => {
  await playDays(page)
  await openTrends(page)
  await page.getByText("Show as a table", { exact: true }).click()
  const table = page.getByRole("table")
  const link = table.getByRole("link", { name: "Tue, Oct 6" })
  await expect(link).toBeVisible()
  expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  expect(await overhangOf(table, "Fri, Oct 9, so far")).toBeLessThanOrEqual(0.5)
  expect(await overhangOf(table, "Tue, Oct 6")).toBeLessThanOrEqual(0.5)
  await link.click()
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("heading")).toHaveText("Tue, Oct 6")
})
