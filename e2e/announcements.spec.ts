import type { Locator } from "@playwright/test"
import { dayHeading, emptyDay, openHistory, playHistory } from "./played-day.ts"
import { gate, NOW } from "./played-household.ts"
import { datesFrom, openTrends, periodOf, playTrends, TRENDS_DAYS } from "./played-period.ts"
import { LAST_WEEK, playWeeks, THIS_WEEK, weekHeading, weekOf } from "./played-week.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const expectChangeInPlace = async (heading: Locator, step: Locator, after: string | RegExp) => {
  await expect(heading).toHaveAttribute("aria-live", "polite")
  await heading.evaluate((element) => element.setAttribute("data-probe", "1"))
  await step.click()
  await expect(heading).toHaveText(after)
  await expect(heading).toHaveAttribute("data-probe", "1")
}

test("History's Day heading is a polite live region that a step changes in place", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-10-09"), emptyDay("2026-10-08")])
  await openHistory(page)
  await expectChangeInPlace(dayHeading(page), page.getByRole("link", { name: "Previous day" }), "Thu, Oct 8")
})

test("History's Week heading is a polite live region that a step changes in place", async ({ page }) => {
  await playHistory(page, [])
  await playWeeks(page, { [THIS_WEEK]: weekOf(THIS_WEEK, []), [LAST_WEEK]: weekOf(LAST_WEEK, []) })
  await openHistory(page, "?view=week")
  await expectChangeInPlace(weekHeading(page), page.getByRole("link", { name: "Previous week" }), /^Sep 28\s–\sOct 4$/u)
})

test.describe("Trends", () => {
  test.beforeEach(async ({ page }) => {
    const week = periodOf(datesFrom("2026-10-05", 7), TRENDS_DAYS)
    const lastWeek = periodOf(datesFrom("2026-09-28", 7), TRENDS_DAYS)
    await playTrends(page, { weeks: { "2026-W41": week, "2026-W40": lastWeek }, months: {} })
    await openTrends(page)
  })

  test("the period's heading is a polite live region that a step changes in place", async ({ page }) => {
    const weeks = page.getByRole("navigation", { name: "weeks" })
    await expectChangeInPlace(
      weeks.getByRole("heading"),
      weeks.getByRole("link", { name: "Previous week" }),
      /^Sep 28\s–\sOct 4$/u,
    )
  })

  test("reads out the bar the keyboard is on", async ({ page }) => {
    const diapers = page.getByRole("region", { name: "Diapers" })
    await diapers.getByRole("img").focus()
    await page.keyboard.press("ArrowRight")
    await expect(diapers.getByRole("status")).toHaveText("Diapers, Tue, Oct 6: 7, 5 pee, 3 poo")
  })

  test("says it's showing the averages again after ×", async ({ page }) => {
    const diapers = page.getByRole("region", { name: "Diapers" })
    await diapers.getByRole("img").focus()
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "Back to the averages" }).click()
    await expect(page.getByText("Showing averages.", { exact: false })).toBeAttached()
  })
})

test("Export reads out that the file is being prepared", async ({ page }) => {
  const answered = gate()
  await page.route("**/api/export.csv", async (route) => {
    await answered.opened
    await route.fulfill({ status: 503, json: { _tag: "ServiceUnavailable" } })
  })
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings")
  await page.getByRole("button", { name: /CSV$/u }).click()
  await expect(page.getByRole("status").filter({ hasText: "Preparing the CSV…" })).toBeAttached()
  answered.open()
})
