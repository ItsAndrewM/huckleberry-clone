import { expect, test } from "@playwright/test"
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

test.use({ timezoneId: "Europe/London" })

test("keeps the feed running when Keep it answers the empty finish, and offers the stop time afresh", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, NOW - 10 * MINUTE, "left", 2)
  const { played, answer } = await playHousehold(page, todayWith(feed))
  await answer("**/api/feeds/feed-1/finish", () => ({
    status: 409,
    json: { _tag: "Conflict", code: "FEED_EMPTY", current: feed },
  }))
  await openToday(page)
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await quickAction(page, "Nursing").click()
  await sheet.getByRole("button", { name: "Finish" }).click()
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Stopped").fill("2026-10-09T09:20")
  await sheet.getByRole("button", { name: "Finish feed" }).click()
  await sheet.getByRole("button", { name: "Keep it" }).click()
  await expect(sheet.getByRole("button", { name: "Switch to Right" })).toBeVisible()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await sheet.getByRole("button", { name: "Finish" }).click()
  await expect(sheet.getByRole("button", { name: "Finish feed" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  expect(played.sent).toHaveLength(1)
})
