import { expect, type Page, test } from "@playwright/test"
import { busyDay, emptyDay, playHistory } from "./played-day.ts"
import { datesFrom, openTrends, periodOf, playTrends, TRENDS_DAYS } from "./played-period.ts"

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
})

test("says there's no usual day yet when nothing was logged in the seven days before", async ({ page }) => {
  await playDays(page)
  await openTrends(page, "?view=day&date=2026-10-01")
  await expect(chart(page, "Diapers")).toContainText("No entries")
  await expect(chart(page, "Diapers")).toContainText("No usual day yet")
  await expect(chart(page, "Diapers").locator('[data-ts-key^="usual:"]')).toHaveCount(0)
})

test("opens the day it shows in History", async ({ page }) => {
  await playDays(page)
  await openTrends(page, "?view=day")
  await page.getByRole("link", { name: "Open in History" }).click()
  await expect(page).toHaveURL(/\/history$/u)
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("heading")).toHaveText("Fri, Oct 9")
})

test("opens the picked day in History, and switches to its Day view", async ({ page }) => {
  await playDays(page)
  await openTrends(page)
  await chart(page, "Diapers").getByRole("img").focus()
  await expect(page.getByRole("link", { name: "Open in History" })).toHaveCount(0)
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Enter")
  await page.getByRole("button", { name: "Day" }).click()
  await expect(page).toHaveURL(/\/trends\?view=day&date=2026-10-06$/u)
  await page.getByRole("link", { name: "Open in History" }).click()
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("heading")).toHaveText("Tue, Oct 6")
})

test("opens a day in History from the table", async ({ page }) => {
  await playDays(page)
  await openTrends(page)
  await page.getByText("Show as a table", { exact: true }).click()
  await page.getByRole("table").getByRole("link", { name: "Tue, Oct 6" }).click()
  await expect(page).toHaveURL(/\/history\?date=2026-10-06$/u)
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("heading")).toHaveText("Tue, Oct 6")
})
