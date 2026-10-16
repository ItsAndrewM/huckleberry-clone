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

test("asks to keep the app open when a pause fails with no connection, since its sheet asks before letting it go", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  await playHousehold(page, todayWith(runningFeed(andrew.id, NOW - 10 * MINUTE, "left")))
  await page.route("**/api/feeds/feed-1/pause", (route) => route.abort("internetdisconnected"))
  await openToday(page)
  await quickAction(page, "Nursing").click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await sheet.getByRole("button", { name: "Pause" }).click()
  await expect(sheet.getByRole("alert")).toContainText(
    "No connection. Keep the app open, and try again once you're back online.",
  )
})
