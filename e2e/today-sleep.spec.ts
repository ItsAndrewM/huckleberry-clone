import type { Page } from "@playwright/test"
import {
  caregiversOf,
  MINUTE,
  NO_TOTALS,
  NOW,
  openToday,
  playHousehold,
  runningSleep,
  sleepingToday,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "Europe/London" })

const total = (page: Page, label: string) =>
  page.locator("dl > div").filter({ has: page.getByRole("term").filter({ hasText: label }) })

test("counts a running sleep up each second, a nap or a night, with when she fell asleep", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, sleepingToday(runningSleep(andrew.id, NOW - 42 * MINUTE - 25_000, "night")))
  await openToday(page)
  await expect(page.getByText("Asleep now · Night")).toBeVisible()
  await expect(page.getByRole("timer")).toHaveText("42:25")
  await expect(page.getByText(/Fell asleep 8:47\sAM/u)).toBeVisible()
  await page.clock.setFixedTime(NOW + 1_000)
  await expect(page.getByRole("timer")).toHaveText("42:26")
})

test("counts the time since she woke, with the sleep before it", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const nap = { ...runningSleep(andrew.id, NOW - 3 * 60 * MINUTE), endedAt: NOW - 130 * MINUTE }
  await playHousehold(page, sleepingToday(nap))
  await openToday(page)
  await expect(page.getByText("Since she woke")).toBeVisible()
  await expect(page.getByText("2 h 10 min")).toBeVisible()
  await expect(page.getByText(/Woke 7:20\sAM · Nap 50 min/u)).toBeVisible()
})

test("says there's no sleep yet before the first one", async ({ page }) => {
  await playHousehold(page, todayWith())
  await openToday(page)
  await expect(page.getByText("No sleeps yet")).toBeVisible()
  await expect(page.getByText("The first sleep you log will show here.")).toBeVisible()
})

test("totals the day's sleep, with naps and night under it", async ({ page }) => {
  const totals = { ...NO_TOTALS, sleepsStarted: 3, sleepSeconds: 40_800, napSeconds: 10_200, nightSeconds: 30_600 }
  await playHousehold(page, { ...todayWith(), totals })
  await openToday(page)
  await expect(total(page, "Sleep")).toContainText("11 h 20 min")
  await expect(total(page, "Sleep")).toContainText("Naps 2 h 50 min · Night 8 h 30 min")
})
