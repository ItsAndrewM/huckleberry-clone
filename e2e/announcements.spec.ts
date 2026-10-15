import { emptyDay, openHistory, playHistory } from "./played-day.ts"
import { gate, NOW } from "./played-household.ts"
import { datesFrom, openTrends, periodOf, playTrends, TRENDS_DAYS } from "./played-period.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

test("History's Day and Week headings are read out when a step changes them", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-10-09"), emptyDay("2026-10-08")])
  await openHistory(page)
  const days = page.getByRole("navigation", { name: "Days" })
  await expect(days.getByRole("heading")).toHaveAttribute("aria-live", "polite")
  await days.getByRole("link", { name: "Previous day" }).click()
  await expect(days.getByRole("heading")).toHaveText("Thu, Oct 8")
})

test.describe("Trends", () => {
  test.beforeEach(async ({ page }) => {
    const week = periodOf(datesFrom("2026-10-05", 7), TRENDS_DAYS)
    await playTrends(page, { weeks: { "2026-W41": week }, months: {} })
    await openTrends(page)
  })

  test("reads out the period's heading when a step changes it", async ({ page }) => {
    await expect(page.getByRole("navigation", { name: "weeks" }).getByRole("heading")).toHaveAttribute(
      "aria-live",
      "polite",
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
