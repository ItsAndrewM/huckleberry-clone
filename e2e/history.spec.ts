import type { Locator, Page } from "@playwright/test"
import { DAY, dayHeading, emptyDay, local, measurement, NO_TOTALS, openHistory, playHistory } from "./played-day.ts"
import { gate, holdRequests } from "./played-household.ts"
import { expect, test } from "./test.ts"

const YESTERDAY = "2026-10-08"

const topOfPage = async (page: Page, region: Locator) => {
  const scrolled = await page.evaluate<number>("window.scrollY")
  return ((await region.boundingBox())?.y ?? Number.NaN) + scrolled
}

test("opens on the household's today, steps back a day and forward again, and never past today", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY), emptyDay(YESTERDAY)])
  await openHistory(page)
  const days = page.getByRole("navigation", { name: "Days" })
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
  await expect(days.getByText("Today", { exact: true })).toBeVisible()
  await expect(days.getByRole("link", { name: "Next day" })).toHaveCount(0)
  await days.getByRole("link", { name: "Previous day" }).click()
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
  await expect(page).toHaveURL(/\/history\?date=2026-10-08$/u)
  await days.getByRole("link", { name: "Next day" }).click()
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
  await expect(page).toHaveURL(/\/history$/u)
})

test("goes back to today from an earlier day", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY), emptyDay(YESTERDAY)])
  await openHistory(page, `?date=${YESTERDAY}`)
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
  await page.getByRole("link", { name: "Back to today" }).click()
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
})

test("doesn't call a link to today the current page while an earlier day shows", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY), emptyDay(YESTERDAY)])
  await openHistory(page, `?date=${YESTERDAY}`)
  const days = page.getByRole("navigation", { name: "Days" })
  await expect(dayHeading(page)).toHaveText("Thu, Oct 8")
  await expect(days.getByRole("link", { name: "Back to today" })).not.toHaveAttribute("aria-current")
  await expect(days.getByRole("link", { name: "Next day" })).not.toHaveAttribute("aria-current")
})

test("makes Back to today a 44 px target", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY), emptyDay(YESTERDAY)])
  await openHistory(page, `?date=${YESTERDAY}`)
  const backToToday = page.getByRole("link", { name: "Back to today" })
  expect((await backToToday.boundingBox())?.height).toBeGreaterThanOrEqual(44)
})

test("starts the day at the same height on an earlier day as on today", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY), emptyDay(YESTERDAY)])
  await openHistory(page, `?date=${YESTERDAY}`)
  const day = page.getByRole("region", { name: "This day" })
  await expect(day).toBeVisible()
  const earlier = await topOfPage(page, day)
  await page.getByRole("link", { name: "Next day" }).click()
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
  await expect(day).toBeVisible()
  const today = await topOfPage(page, day)
  expect(today).toBeCloseTo(earlier, 0)
})

test("shows today for an address naming a later day or no real day", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY)])
  await openHistory(page, "?date=2026-10-12")
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
  await page.goto("/history?date=2026-02-30")
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
})

test("stops stepping back at her birth date", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-09-01")])
  await openHistory(page, "?date=2026-09-01")
  await expect(dayHeading(page)).toHaveText("Tue, Sep 1")
  await expect(page.getByRole("link", { name: "Previous day" })).toHaveCount(0)
})

test("words the day's totals as Today's card does", async ({ page }) => {
  const totals = {
    ...NO_TOTALS,
    feedsStarted: 7,
    nursingSeconds: 6720,
    bottleMl: 540,
    diapers: 8,
    wetDiapers: 6,
    dirtyDiapers: 3,
  }
  await playHistory(page, [{ ...emptyDay(DAY), totals }])
  await openHistory(page)
  const day = page.getByRole("region", { name: "This day" })
  await expect(day).toContainText(/7 feeds started\s·\s1 h 52 min nursing\s·\s540 mL in bottles/u)
  await expect(day).toContainText(/8 diapers\s·\s6 pee\s·\s3 poo/u)
})

test("says so when nothing was logged that day", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY)])
  await openHistory(page)
  await expect(page.getByRole("region", { name: "This day" })).toHaveText("Nothing logged.")
})

test("offers Try again when a day couldn't be loaded", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY)])
  await openHistory(page, `?date=${YESTERDAY}`)
  await expect(page.getByText("This day couldn't be loaded.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
})

test("says Loading… for the next day it steps to after a Try again that failed", async ({ page }) => {
  const { played } = await playHistory(page, [])
  await openHistory(page)
  const retried = page.waitForResponse(`**/api/days/${DAY}`)
  await page.getByRole("button", { name: "Try again" }).click()
  await retried
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled()
  played.days.push(emptyDay(YESTERDAY))
  const answered = gate()
  await holdRequests(page, `**/api/days/${YESTERDAY}`, () => answered.opened)
  await page.getByRole("link", { name: "Previous day" }).click()
  await expect(page.getByText("Loading…")).toBeVisible()
  await expect(page.getByText("This day couldn't be loaded.")).toHaveCount(0)
  answered.open()
  await expect(page.getByRole("region", { name: "This day" })).toHaveText("Nothing logged.")
})

test("opens a measurement from the growth strip in its edit sheet", async ({ page }) => {
  const taken = measurement("m1", local("08:00"), 4210, 55, 37.5, "caregiver-andrew")
  await playHistory(page, [{ ...emptyDay(DAY), measurements: [taken] }])
  await page.route("**/api/growth", (route) => route.fulfill({ json: { measurements: [taken] } }))
  await openHistory(page)
  const strip = page.getByRole("button", { name: "Edit the measurement from 8:00 AM" })
  await expect(strip).toBeVisible()
  await expect(page.getByRole("region", { name: "This day" })).not.toContainText("Nothing logged.")
  await strip.click()
  const sheet = page.getByRole("dialog", { name: "Edit measurement" })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel("Weight", { exact: true })).toHaveValue("4.21")
})

test("moves to the new day at the household's midnight while it shows today", async ({ page }) => {
  await playHistory(page, [emptyDay(DAY), emptyDay("2026-10-10")])
  await page.clock.install({ time: local("23:58") })
  await page.goto("/history")
  await expect(dayHeading(page)).toHaveText("Fri, Oct 9")
  await page.clock.fastForward("03:00")
  await expect(dayHeading(page)).toHaveText("Sat, Oct 10")
})
