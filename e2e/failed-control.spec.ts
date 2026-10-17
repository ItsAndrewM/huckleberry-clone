import {
  caregiversOf,
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

test("says a pause that fails with no connection is kept on this phone", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith(runningFeed(andrew.id, NOW - 10 * MINUTE, "left")))
  await page.route("**/api/feeds/feed-1/pause", (route) => route.abort("internetdisconnected"))
  await openToday(page)
  await quickAction(page, "Nursing").click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await sheet.getByRole("button", { name: "Pause" }).click()
  await expect(sheet.getByRole("alert")).toContainText(
    "No connection. This is kept on this phone: try again once you're back online.",
  )
})

test("asks to keep the app open when an Edit sheet's save fails with no connection, since the phone doesn't keep it", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const diaper = { id: "diaper-1", occurredAt: NOW - 30 * MINUTE, wet: true, dirty: false, ...savedBy(andrew.id) }
  await playHousehold(page, { ...todayWith(), recent: [{ kind: "diaper", diaper }] })
  await page.route("**/api/diapers/diaper-1", (route) => route.abort("internetdisconnected"))
  await openToday(page)
  await page
    .getByRole("list", { name: "Last 24 hours" })
    .getByRole("button", { name: /Diaper/u })
    .click()
  const sheet = page.getByRole("dialog", { name: "Edit diaper" })
  await sheet.getByRole("button", { name: "Both" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText(
    "No connection. Keep the app open, and try again once you're back online.",
  )
})
