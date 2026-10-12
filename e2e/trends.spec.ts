import { expect, type Page, test } from "@playwright/test"
import { datesFrom, openTrends, periodOf, playTrends, TRENDS_DAYS } from "./played-period.ts"

test.use({ timezoneId: "America/Vancouver" })

const WEEK = periodOf(datesFrom("2026-10-05", 7), TRENDS_DAYS)
const LAST_WEEK = periodOf(datesFrom("2026-09-28", 7), TRENDS_DAYS)
const OCTOBER = periodOf(datesFrom("2026-10-01", 31), TRENDS_DAYS)

const playWeeks = (page: Page) =>
  playTrends(page, { weeks: { "2026-W41": WEEK, "2026-W40": LAST_WEEK }, months: { "2026-10": OCTOBER } })

const chart = (page: Page, name: string) => page.getByRole("region", { name })
const periods = (page: Page) => page.getByRole("navigation", { name: /weeks|months/u })

test("opens on this week, so far, with each chart's average over the days that have finished", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await expect(periods(page).getByRole("heading")).toHaveText(/^Oct 5\s–\s11$/u)
  await expect(periods(page)).toContainText("This week, so far")
  await expect(chart(page, "Feeds started")).toContainText("8 a day, over 4 days")
  await expect(chart(page, "Nursing")).toContainText("1 h 37 min a day, over 4 days")
  await expect(chart(page, "Nursing")).toContainText(/Left 48 min\s·\sRight 49 min/u)
  await expect(chart(page, "Bottles")).toContainText("543 mL a day, over 4 days")
  await expect(chart(page, "Diapers")).toContainText(/8 a day, over 4 days/u)
})

test("leaves a day with nothing logged out of the averages, and says so in the table", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page, "?date=2026-09-28")
  await expect(periods(page).getByRole("heading")).toHaveText(/^Sep 28\s–\sOct 4$/u)
  await expect(chart(page, "Feeds started")).toContainText("8.5 a day, over 2 days")
  await page.getByText("Show as a table", { exact: true }).click()
  const table = page.getByRole("table")
  await expect(table.getByRole("row", { name: /Wed, Sep 30/u })).toContainText("No entries")
  await expect(table.getByRole("row", { name: /Fri, Oct 2/u }).getByRole("cell")).toHaveText([
    "8",
    "1 h 35 min",
    "420 mL",
    "7",
  ])
})

test("steps back a week and forward again, and never past this week", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await expect(periods(page).getByRole("link", { name: "Next week" })).toHaveCount(0)
  await periods(page).getByRole("link", { name: "Previous week" }).click()
  await expect(page).toHaveURL(/\/trends\?date=2026-09-28$/u)
  await expect(periods(page).getByRole("link", { name: "Back to this week" })).toBeVisible()
  await periods(page).getByRole("link", { name: "Next week" }).click()
  await expect(page).toHaveURL(/\/trends$/u)
})

test("shows this month so far, a bar a day, with its average", async ({ page }) => {
  await playWeeks(page)
  await openTrends(page)
  await page.getByRole("button", { name: "Month" }).click()
  await expect(page).toHaveURL(/\/trends\?view=month$/u)
  await expect(periods(page).getByRole("heading")).toHaveText("October 2026")
  await expect(periods(page)).toContainText("This month, so far")
  await expect(chart(page, "Feeds started")).toContainText("8.2 a day, over 6 days")
  await expect(chart(page, "Feeds started").locator('text[data-ts-key^="x-tick-label"]')).toHaveText([
    "1",
    "8",
    "15",
    "22",
    "29",
  ])
})

test("loads the week on Try again, once the household answers", async ({ page }) => {
  await playWeeks(page)
  let refusing = true
  await page.route(/\/api\/weeks\/2026-W41$/u, (route) =>
    refusing ? route.fulfill({ status: 404 }) : route.fallback(),
  )
  await openTrends(page)
  await expect(page.getByText("This week couldn't be loaded.")).toBeVisible()
  refusing = false
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(chart(page, "Feeds started")).toContainText("8 a day, over 4 days")
})
