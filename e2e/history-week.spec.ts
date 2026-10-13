import { expect, type Page, test } from "@playwright/test"
import { busyDay, dayHeading, emptyDay, NO_TOTALS, openHistory, playHistory } from "./played-day.ts"
import { LAST_WEEK, playWeeks, THIS_WEEK, weekGrid, weekHeading, weekOf } from "./played-week.ts"

test.use({ timezoneId: "Europe/London" })

const LOGGED = { ...NO_TOTALS, feedsStarted: 5, diapers: 3, wetDiapers: 2, dirtyDiapers: 2 }

const playBusyWeek = async (page: Page) => {
  const { played, andrew, emily } = await playHistory(page, [])
  const busy = { ...busyDay(andrew, emily), totals: LOGGED }
  played.days.push(busy, emptyDay("2026-10-06"), emptyDay("2026-09-28"))
  const asked = await playWeeks(page, {
    [THIS_WEEK]: weekOf(THIS_WEEK, [busy]),
    [LAST_WEEK]: weekOf(LAST_WEEK, []),
    "2026-W38": weekOf("2026-W38", []),
  })
  return { played, asked, andrew }
}

test("shows the week as seven days, each one up to today opening its Day view", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await expect(weekHeading(page)).toHaveText(/^Oct 5\s–\s11$/u)
  const days = weekGrid(page).getByRole("link")
  await expect(days).toHaveCount(5)
  await expect(days.first()).toHaveAccessibleName("Mon, Oct 5: nothing logged")
  const friday = weekGrid(page).getByRole("link", { name: "Fri, Oct 9: 5 feeds started; 3 diapers, 2 pee, 2 poo" })
  await friday.click()
  await expect(page).toHaveURL(/\/history$/u)
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
})

test("steps back a week and comes back to this week", async ({ page }) => {
  const { asked } = await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await page.getByRole("link", { name: "Previous week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week&date=2026-09-28$/u)
  await expect(weekHeading(page)).toHaveText(/^Sep 28\s–\sOct 4$/u)
  expect(asked).toContain(LAST_WEEK)
  await page.getByRole("link", { name: "Back to this week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week$/u)
  await expect(weekHeading(page)).toHaveText(/^Oct 5\s–\s11$/u)
  await expect(page.getByRole("link", { name: "Next week" })).toHaveCount(0)
})

test("doesn't call a day's column the current page", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?view=week")
  await expect(weekGrid(page).getByRole("link")).toHaveCount(5)
  await expect(weekGrid(page).locator('[aria-current="page"]')).toHaveCount(0)
  await page.getByRole("link", { name: "Previous week" }).click()
  await expect(weekGrid(page).getByRole("link")).toHaveCount(7)
  await expect(weekGrid(page).locator('[aria-current="page"]')).toHaveCount(0)
})

test("switches from a day to the week that holds it, and back to today", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-09-28")
  await page.getByRole("group", { name: "History by" }).getByRole("button", { name: "Week" }).click()
  await expect(page).toHaveURL(/\/history\?view=week&date=2026-09-28$/u)
  await page.getByRole("link", { name: "Back to this week" }).click()
  await page.getByRole("group", { name: "History by" }).getByRole("button", { name: "Day" }).click()
  await expect(page).toHaveURL(/\/history$/u)
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
})

test("keeps the day switcher at the top while the day scrolls", async ({ page }) => {
  await playBusyWeek(page)
  await openHistory(page, "?date=2026-10-06")
  await expect(page.getByRole("region", { name: "The day by hour" })).toBeVisible()
  await page.evaluate("window.scrollTo(0, 800)")
  await expect.poll(() => page.evaluate<number>("window.scrollY")).toBeGreaterThan(400)
  await expect(page.getByRole("navigation", { name: "Days" })).toBeInViewport()
})
