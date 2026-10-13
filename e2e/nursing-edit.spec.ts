import { expect, type Page, test } from "@playwright/test"
import { caregiversOf, MINUTE, NOW, openToday, playHousehold, runningFeed, todayWith } from "./played-household.ts"

test.use({ timezoneId: "Europe/London" })

const recent = (page: Page) => page.getByRole("list", { name: "Last 24 hours" })
const nursing = (page: Page) => page.getByRole("dialog", { name: "Nursing" })

const playRunning = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const running = runningFeed(andrew.id, NOW - 30 * MINUTE, "left")
  const household = await playHousehold(page, todayWith(running))
  await openToday(page)
  await recent(page)
    .getByRole("button", { name: /In progress/u })
    .click()
  return { ...household, running }
}

test("sets an earlier start on a running feed, for a timer started late", async ({ page }) => {
  const { answer, played, running } = await playRunning(page)
  await answer("**/api/segments/segment-1", ({ body }) => {
    const startedAt = body.startedAt ?? running.startedAt
    const feed = {
      ...running,
      startedAt,
      version: 2,
      segments: [{ ...running.segments[0], id: "segment-1", side: "left" as const, startedAt, endedAt: null }],
    }
    played.today = todayWith(feed)
    return { status: 200, json: { feed, changed: [["today"]] } }
  })
  const sheet = nursing(page)
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Started").fill("2026-10-09T08:50")
  await sheet.getByRole("button", { name: "Save start" }).click()
  await expect(sheet.getByText(/^8:50\sAM$/u)).toBeVisible()
  expect(played.sent).toEqual([
    {
      method: "PATCH",
      path: "/api/segments/segment-1",
      body: {
        actionId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        version: 1,
        side: "left",
        startedAt: NOW - 40 * MINUTE,
        endedAt: null,
      },
    },
  ])
})

test("keeps Save start off until the start is changed", async ({ page }) => {
  await playRunning(page)
  const sheet = nursing(page)
  const save = sheet.getByRole("button", { name: "Save start" })
  await sheet.getByRole("button", { name: "Change" }).click()
  await expect(save).toBeDisabled()
  await sheet.getByLabel("Started").fill("2026-10-09T08:50")
  await expect(save).toBeEnabled()
  await sheet.getByLabel("Started").fill("2026-10-09T09:00")
  await expect(save).toBeDisabled()
})

test("won't start the side after now", async ({ page }) => {
  await playRunning(page)
  const sheet = nursing(page)
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Started").fill("2026-10-09T09:33")
  await expect(sheet.getByText("That's in the future.")).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Save start" })).toBeDisabled()
})

test("deletes a running feed after asking, closing the sheet, and Undo brings it back running", async ({ page }) => {
  const { answer, played, running } = await playRunning(page)
  await answer("**/api/feeds/feed-1", () => {
    played.today = todayWith()
    return { status: 200, json: { feed: { ...running, version: 2, deletedAt: NOW }, changed: [["today"]] } }
  })
  await answer("**/api/feeds/feed-1/restore", () => {
    played.today = todayWith({ ...running, version: 3 })
    return { status: 200, json: { feed: { ...running, version: 3 }, changed: [["today"]] } }
  })
  const sheet = nursing(page)
  await sheet.getByRole("button", { name: "Delete feed" }).click()
  await sheet.getByRole("alert").getByRole("button", { name: "Delete" }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText("Nothing logged in the last 24 hours.")).toBeVisible()
  await page.getByRole("status").filter({ hasText: "Feed deleted" }).getByRole("button", { name: "Undo" }).click()
  await expect(recent(page)).toContainText("In progress")
  expect(played.sent.map(({ method, path, body }) => [method, path, body.version])).toEqual([
    ["DELETE", "/api/feeds/feed-1", 1],
    ["POST", "/api/feeds/feed-1/restore", 2],
  ])
})
