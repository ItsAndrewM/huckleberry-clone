import {
  caregiversOf,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningFeed,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test("promises nothing kept when a pause fails with no connection, since it goes with its sheet", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith(runningFeed(andrew.id, NOW - 10 * MINUTE, "left")))
  await page.route("**/api/feeds/feed-1/pause", (route) => route.abort("internetdisconnected"))
  await openToday(page)
  await quickAction(page, "Nursing").click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await sheet.getByRole("button", { name: "Pause" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection. Try again once you're back online.")
})
