import { emptyDay, openHistory, playHistory } from "./played-day.ts"
import {
  caregiversOf,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningFeed,
  runningSleep,
  sleepingToday,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

test("the running sleep's Change buttons are named by their field", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, sleepingToday(runningSleep(andrew.id, NOW - 40 * MINUTE)))
  await openToday(page)
  await quickAction(page, "Sleep").click()
  const sheet = page.getByRole("dialog", { name: "Sleep" })
  await expect(sheet.getByRole("button", { name: "Change, Fell asleep", exact: true })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Change, Woke", exact: true })).toBeVisible()
})

test("the running sleep's timer is described by its status line", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, sleepingToday(runningSleep(andrew.id, NOW - 40 * MINUTE)))
  await openToday(page)
  await quickAction(page, "Sleep").click()
  await expect(page.getByRole("dialog", { name: "Sleep" }).getByRole("timer")).toHaveAccessibleDescription(
    "Asleep · Nap",
  )
})

test("the running feed's timer is described by its side", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith(runningFeed(andrew.id, NOW - 10 * MINUTE, "left")))
  await openToday(page)
  await quickAction(page, "Nursing").click()
  await expect(page.getByRole("dialog", { name: "Nursing" }).getByRole("timer")).toHaveAccessibleDescription(
    "Left side",
  )
})

test("the running feed's Change button is named by its field", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith(runningFeed(andrew.id, NOW - 10 * MINUTE, "left")))
  await openToday(page)
  await quickAction(page, "Nursing").click()
  await expect(
    page.getByRole("dialog", { name: "Nursing" }).getByRole("button", { name: "Change, Started", exact: true }),
  ).toBeVisible()
})

test("History's Change says what it changes", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-10-09")])
  await openHistory(page)
  await expect(
    page.getByRole("navigation", { name: "Days" }).getByRole("button", { name: "Change day", exact: true }),
  ).toBeVisible()
})

test("the Log at menu names an earlier day, and only an earlier day", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-10-09"), emptyDay("2026-10-08")])
  await openHistory(page, "?date=2026-10-08")
  const grid = page.getByRole("region", { name: "The day by hour" })
  await grid.getByRole("button", { name: "Log at 9 AM", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Log at 9:30 AM on Thu, Oct 8", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await openHistory(page)
  await grid.getByRole("button", { name: "Log at 6 AM", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Log at 6:30 AM", exact: true })).toBeVisible()
})
