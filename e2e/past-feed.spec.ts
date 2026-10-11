import { expect, type Page, test } from "@playwright/test"
import { caregiversOf, MINUTE, NOW, openToday, playHousehold, runningFeed, todayWith } from "./played-household.ts"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)

test.use({ timezoneId: "Europe/London" })
const EIGHT = NOW - 90 * MINUTE

const openPastFeed = async (page: Page) => {
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Nursing" }).click()
  await page.getByRole("dialog", { name: "Nursing" }).getByRole("button", { name: "Log a past feed" }).click()
  return page.getByRole("dialog", { name: "Past feed" })
}

test("logs a past feed from its start, the first side and minutes per side", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { played, answer } = await playHousehold(page, todayWith())
  const saved = { ...runningFeed(andrew.id, EIGHT, "right"), status: "completed", endedAt: EIGHT + 20 * MINUTE }
  await answer("**/api/feeds", () => ({ status: 201, json: { feed: saved, changed: [["today"]] } }))
  await openToday(page)
  const sheet = await openPastFeed(page)
  await sheet.getByLabel("Started").fill("2026-10-09T08:00")
  await sheet.getByRole("button", { name: "Right" }).click()
  await sheet.getByRole("textbox", { name: "Left" }).fill("12")
  await sheet.getByRole("textbox", { name: "Right" }).fill("8")
  await sheet.getByRole("button", { name: "More formula" }).click()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect
    .poll(() => played.sent.map(({ body }) => body))
    .toEqual([
      {
        actionId: ACTION_ID,
        segments: [
          { side: "right", startedAt: EIGHT, endedAt: EIGHT + 8 * MINUTE },
          { side: "left", startedAt: EIGHT + 8 * MINUTE, endedAt: EIGHT + 20 * MINUTE },
        ],
        portions: [{ occurredAt: EIGHT + 20 * MINUTE, breastMilkMl: 0, formulaMl: 10 }],
      },
    ])
  await expect(page.getByRole("status").filter({ hasText: "Feed saved" })).toBeVisible()
})

test("says which feed a past feed overlaps, and keeps what was entered", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { answer } = await playHousehold(page, todayWith())
  const earlier = {
    ...runningFeed(andrew.id, EIGHT - 5 * MINUTE, "left"),
    status: "completed",
    endedAt: EIGHT + 10 * MINUTE,
  }
  await answer("**/api/feeds", () => ({
    status: 409,
    json: { _tag: "Conflict", code: "SEGMENT_OVERLAP", current: earlier },
  }))
  await openToday(page)
  const sheet = await openPastFeed(page)
  await sheet.getByLabel("Started").fill("2026-10-09T08:00")
  await sheet.getByRole("textbox", { name: "Left" }).fill("15")
  await sheet.getByRole("button", { name: "Save" }).click()
  const reopened = page.getByRole("dialog", { name: "Past feed" })
  await expect(reopened.getByRole("alert")).toHaveText(/^This overlaps the feed at 7:55\sAM–8:10\sAM\.$/u)
  await expect(reopened.getByRole("alert")).toBeInViewport()
  await expect(reopened.getByRole("textbox", { name: "Left" })).toHaveValue("15")
  await expect(reopened.getByLabel("Started")).toHaveValue("2026-10-09T08:00")
})
