import { expect, type Page, test } from "@playwright/test"
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

const finishAtItsStart = async (page: Page) => {
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
  await expect(sheet.getByText("Stopping at the start leaves nothing in this feed. Delete it?")).toBeVisible()
  return { sheet, sent: played.sent }
}

test("keeps the feed running when Keep it answers the empty finish, and offers the stop time afresh", async ({
  page,
}) => {
  const { sheet, sent } = await finishAtItsStart(page)
  await sheet.getByRole("button", { name: "Keep it" }).click()
  await expect(sheet.getByRole("button", { name: "Switch to Right" })).toBeVisible()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await sheet.getByRole("button", { name: "Finish" }).click()
  await expect(sheet.getByRole("button", { name: "Finish feed" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  expect(sent).toHaveLength(1)
})

test("closes at once when the empty finish's sheet is dismissed, without asking to discard it", async ({ page }) => {
  const { sheet, sent } = await finishAtItsStart(page)
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  await expect(page.getByText("Discard this entry?")).toHaveCount(0)
  await quickAction(page, "Nursing").click()
  await expect(sheet.getByRole("button", { name: "Switch to Right" })).toBeVisible()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  expect(sent).toHaveLength(1)
})
