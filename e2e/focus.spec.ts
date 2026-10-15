import type { Page } from "@playwright/test"
import { busyDay, emptyDay, openHistory, playHistory } from "./played-day.ts"
import {
  caregiversOf,
  gate,
  holdRequests,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningFeed,
  savedBy,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const recent = (page: Page) => page.getByRole("list", { name: "Last 24 hours" })

const playDiapers = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const diaperAt = (id: string, minutesAgo: number) => ({
    id,
    occurredAt: NOW - minutesAgo * MINUTE,
    wet: true,
    dirty: false,
    ...savedBy(andrew.id),
  })
  const diapers = [diaperAt("newer", 20), diaperAt("older", 50)]
  return playHousehold(page, { ...todayWith(), recent: diapers.map((diaper) => ({ kind: "diaper", diaper })) })
}

test("a sheet opened by a tap gives focus back to the button that opened it", async ({ page }) => {
  await playHousehold(page, todayWith())
  await openToday(page)
  await quickAction(page, "Diaper").click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(quickAction(page, "Diaper")).toBeFocused()
})

test("an edit that's still saving keeps focus on its row", async ({ page }) => {
  const { answer } = await playDiapers(page)
  await answer("**/api/diapers/newer", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
  const answered = gate()
  await holdRequests(page, "**/api/diapers/newer", () => answered.opened)
  await openToday(page)
  await recent(page)
    .getByRole("button", { name: /Diaper/u })
    .first()
    .click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Both" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect(recent(page).getByRole("listitem").filter({ hasText: "Saving" })).toBeFocused()
  answered.open()
})

test("deleting an entry moves focus to the row after it", async ({ page }) => {
  const { answer } = await playDiapers(page)
  await answer("**/api/diapers/newer", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
  const answered = gate()
  await holdRequests(page, "**/api/diapers/newer", () => answered.opened)
  await openToday(page)
  await recent(page)
    .getByRole("button", { name: /Diaper/u })
    .first()
    .click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Delete diaper" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(recent(page).getByRole("button", { name: /Diaper/u })).toHaveCount(1)
  await expect(recent(page).getByRole("button", { name: /Diaper/u })).toBeFocused()
  answered.open()
})

test("a failure that comes back to an open sheet takes focus, with its buttons next", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { answer } = await playHousehold(page, todayWith(runningFeed(andrew.id, NOW - 10 * MINUTE, "left")))
  await answer("**/api/feeds/feed-1/pause", () => ({ status: 503, json: { _tag: "ServiceUnavailable" } }))
  await openToday(page)
  await quickAction(page, "Nursing").click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await sheet.getByRole("button", { name: "Pause" }).click()
  await expect(sheet.getByRole("alert")).toBeFocused()
})

test("picking a date in Go to gives focus back to Change", async ({ page }) => {
  await playHistory(page, [emptyDay("2026-10-09"), emptyDay("2026-10-05")])
  await openHistory(page)
  const days = page.getByRole("navigation", { name: "Days" })
  await days.getByRole("button", { name: "Change" }).click()
  await page.getByLabel("Go to").fill("2026-10-05")
  await expect(days.getByRole("heading")).toHaveText("Mon, Oct 5")
  await expect(days.getByRole("button", { name: "Change" })).toBeFocused()
})

test.describe("on an iPhone's browser tab", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Not now on the install card moves focus to the page's heading", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "standalone", { configurable: true, get: () => false })
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", { configurable: true, get: () => 5 })
    })
    await page.goto("/")
    await page.getByRole("region", { name: "Install Baby tracker" }).getByRole("button", { name: "Not now" }).click()
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeFocused()
  })
})

test("deleting an entry from History's details moves focus to the page's heading", async ({ page }) => {
  const { played, andrew, emily } = await playHistory(page, [])
  played.days.push(busyDay(andrew, emily))
  const answered = gate()
  await page.route("**/api/diapers/both", async (route) => {
    await answered.opened
    await route.fulfill({ status: 503, json: { _tag: "ServiceUnavailable" } })
  })
  await openHistory(page)
  await page.getByRole("button", { name: /^Diaper at 5:30\sAM/u }).click()
  await page.getByRole("dialog", { name: "Diaper" }).getByRole("button", { name: "Edit" }).click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Delete diaper" }).click()
  await sheet.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeFocused()
  answered.open()
})
