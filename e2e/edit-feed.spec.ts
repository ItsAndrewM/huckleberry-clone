import type { Page, WebSocketRoute } from "@playwright/test"
import {
  caregiversOf,
  type FeedAnswer,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  savedBy,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "Europe/London" })

const AT_8 = NOW - 90 * MINUTE
const recent = (page: Page) => page.getByRole("list", { name: "Last 24 hours" })

const nursed = (by: string): FeedAnswer => ({
  id: "feed-1",
  status: "completed",
  startedAt: AT_8,
  endedAt: AT_8 + 23 * MINUTE,
  segments: [
    { id: "s1", side: "left", startedAt: AT_8, endedAt: AT_8 + 14 * MINUTE },
    { id: "s2", side: "right", startedAt: AT_8 + 14 * MINUTE, endedAt: AT_8 + 23 * MINUTE },
  ],
  portions: [],
  ...savedBy(by),
})

const bottled = (by: string): FeedAnswer => ({
  ...nursed(by),
  id: "feed-2",
  endedAt: AT_8,
  segments: [],
  portions: [{ id: "p1", occurredAt: AT_8, breastMilkMl: 0, formulaMl: 90 }],
})

const playSocket = async (page: Page) => {
  const sockets: WebSocketRoute[] = []
  await page.routeWebSocket(/\/api\/ws$/u, (socket) => {
    sockets.push(socket)
  })
  return async () => {
    await expect.poll(() => sockets.length).toBeGreaterThan(0)
    sockets.at(-1)?.send(JSON.stringify({ changed: [["today"]] }))
  }
}

const playFeed = async (page: Page, kind: "nursed" | "bottled") => {
  const todayChanged = await playSocket(page)
  const { andrew, emily } = await caregiversOf(page)
  const feed = kind === "nursed" ? nursed(andrew.id) : bottled(andrew.id)
  const household = await playHousehold(page, { ...todayWith(), recent: [{ kind: "feed", feed }] })
  const showing = (shown: FeedAnswer) => {
    household.played.today = { ...todayWith(), recent: [{ kind: "feed", feed: shown }] }
  }
  await household.answer(`**/api/feeds/${feed.id}`, ({ method, body }) => {
    if (method === "DELETE")
      return { status: 200, json: { feed: { ...feed, version: 2, deletedAt: NOW }, changed: [] } }
    const segments = (body.segments ?? []).map((segment, index) => ({ id: `n${index}`, ...segment }))
    const portions = (body.portions ?? []).map((portion, index) => ({ id: `b${index}`, ...portion }))
    return { status: 200, json: { feed: { ...feed, segments, portions, version: 2 }, changed: [] } }
  })
  await openToday(page)
  return { ...household, feed, emily, showing, todayChanged }
}

const openFeed = async (page: Page, name: RegExp, title: string) => {
  await recent(page).getByRole("button", { name }).click()
  return page.getByRole("dialog", { name: title })
}

test("moves the switch earlier in one Save, and Today shows it before the household answers", async ({ page }) => {
  const { played } = await playFeed(page, "nursed")
  const sheet = await openFeed(page, /Nursing/u, "Edit feed")
  await sheet.getByRole("group", { name: "Side 1" }).getByLabel("Minutes").fill("10")
  const right = sheet.getByRole("group", { name: "Side 2" })
  await right.getByLabel("Started").fill("2026-10-09T08:10")
  await right.getByLabel("Minutes").fill("13")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect(recent(page)).toContainText("Left 10 min")
  await expect(recent(page)).toContainText("Right 13 min")
  expect(played.sent).toEqual([
    {
      method: "PUT",
      path: "/api/feeds/feed-1",
      body: {
        actionId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        version: 1,
        segments: [
          { side: "left", startedAt: AT_8, endedAt: AT_8 + 10 * MINUTE },
          { side: "right", startedAt: AT_8 + 10 * MINUTE, endedAt: AT_8 + 23 * MINUTE },
        ],
        portions: [],
      },
    },
  ])
})

test("adds a bottle the parent forgot, given when the feed ended", async ({ page }) => {
  const { played } = await playFeed(page, "nursed")
  const sheet = await openFeed(page, /Nursing/u, "Edit feed")
  await sheet.getByRole("button", { name: "Add a bottle" }).click()
  await sheet.getByRole("group", { name: "Bottle 1" }).getByLabel("Formula", { exact: true }).fill("30")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet).toBeHidden()
  await expect
    .poll(() => played.sent.at(0)?.body.portions)
    .toEqual([{ occurredAt: AT_8 + 23 * MINUTE, breastMilkMl: 0, formulaMl: 30 }])
})

test("moves the whole feed, saying by how much first", async ({ page }) => {
  const { played } = await playFeed(page, "nursed")
  const sheet = await openFeed(page, /Nursing/u, "Edit feed")
  await sheet.getByLabel("Feed started").fill("2026-10-09T07:00")
  await expect(sheet.getByText("Moves every side and bottle 1 h earlier.")).toBeVisible()
  await expect(sheet.getByRole("group", { name: "Side 2" }).getByLabel("Started")).toHaveValue("2026-10-09T07:14")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect
    .poll(() => played.sent.at(0)?.body.segments)
    .toEqual([
      { side: "left", startedAt: AT_8 - 60 * MINUTE, endedAt: AT_8 - 46 * MINUTE },
      { side: "right", startedAt: AT_8 - 46 * MINUTE, endedAt: AT_8 - 37 * MINUTE },
    ])
})

test("won't save two sides at once, and says why", async ({ page }) => {
  await playFeed(page, "nursed")
  const sheet = await openFeed(page, /Nursing/u, "Edit feed")
  await sheet.getByRole("group", { name: "Side 2" }).getByLabel("Started").fill("2026-10-09T08:05")
  await expect(sheet.getByText("Two sides overlap. Move one so they don't.")).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Save" })).toBeDisabled()
})

test("deletes a bottle after asking, and Undo brings it back", async ({ page }) => {
  const { played, answer, feed } = await playFeed(page, "bottled")
  await answer(`**/api/feeds/${feed.id}/restore`, () => ({
    status: 200,
    json: { feed: { ...feed, version: 3 }, changed: [] },
  }))
  const sheet = await openFeed(page, /Bottle/u, "Edit bottle")
  await sheet.getByRole("button", { name: "Delete bottle" }).click()
  await sheet.getByRole("alert").getByRole("button", { name: "Delete" }).click()
  await expect(sheet).toBeHidden()
  await page.getByRole("status").filter({ hasText: "Bottle deleted" }).getByRole("button", { name: "Undo" }).click()
  await expect(recent(page)).toContainText("Bottle")
  expect(played.sent.map(({ method, path, body }) => [method, path, body.version])).toEqual([
    ["DELETE", "/api/feeds/feed-2", 1],
    ["POST", "/api/feeds/feed-2/restore", 2],
  ])
})

test("offers only to delete the feed once every side is removed", async ({ page }) => {
  const { played } = await playFeed(page, "nursed")
  const sheet = await openFeed(page, /Nursing/u, "Edit feed")
  await sheet.getByRole("button", { name: "Remove side 1" }).click()
  await sheet.getByRole("button", { name: "Remove side 1" }).click()
  await expect(sheet.getByRole("alert")).toContainText("Nothing is left in this feed. Delete this feed?")
  await expect(sheet.getByRole("button", { name: "Save" })).toHaveCount(0)
  await sheet.getByRole("alert").getByRole("button", { name: "Delete" }).click()
  await expect.poll(() => played.sent.map(({ method }) => method)).toEqual(["DELETE"])
})

test("loads Emily's sides and bottles into the form even when they reached this phone before the save", async ({
  page,
}) => {
  const { answer, showing, feed, emily, todayChanged } = await playFeed(page, "nursed")
  const theirs = {
    ...feed,
    version: 2,
    updatedBy: emily.id,
    portions: [{ id: "p1", occurredAt: AT_8 + 23 * MINUTE, breastMilkMl: 0, formulaMl: 30 }],
  }
  await answer(`**/api/feeds/${feed.id}`, () => ({
    status: 409,
    json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs },
  }))
  const sheet = await openFeed(page, /Nursing/u, "Edit feed")
  const left = sheet.getByRole("group", { name: "Side 1" })
  await expect(left.getByLabel("Minutes")).toHaveValue("14")
  showing(theirs)
  await todayChanged()
  await expect(page.getByRole("list", { name: "Last 24 hours", includeHidden: true })).toContainText(
    "Nursing and bottle",
  )
  await left.getByLabel("Minutes").fill("10")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText(`${emily.displayName} changed this a moment ago.`)
  await sheet.getByRole("button", { name: `Use ${emily.displayName}'s` }).click()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await expect(sheet.getByRole("group", { name: "Bottle 1" }).getByLabel("Formula", { exact: true })).toHaveValue("30")
  await expect(left.getByLabel("Minutes")).toHaveValue("14")
})
