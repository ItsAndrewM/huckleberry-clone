import { expect, type Page, test } from "@playwright/test"
import {
  caregiversOf,
  type FeedAnswer,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  runningFeed,
  type Sent,
  todayWith,
} from "./played-household.ts"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)

test.use({ timezoneId: "Europe/London" })
const STARTED = NOW - 10 * MINUTE

const openNursing = async (page: Page) => {
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Nursing" }).click()
  return page.getByRole("dialog", { name: "Nursing" })
}

const closedAt = (feed: FeedAnswer, at: number) =>
  feed.segments.map((segment) => (segment.endedAt === null ? { ...segment, endedAt: at } : segment))

test("starts a feed in two taps, marking the side the last feed ended on", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { played, answer } = await playHousehold(page, todayWith(null, { lastBottle: null, lastSide: "right" }))
  await answer("**/api/feeds/start", () => {
    const feed = runningFeed(andrew.id, NOW, "left")
    played.today = todayWith(feed)
    return { status: 201, json: { feed, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = await openNursing(page)
  await expect(sheet.getByRole("button", { name: "Right Last" })).toBeVisible()
  await sheet.getByRole("button", { name: "Left", exact: true }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      { method: "POST", path: "/api/feeds/start", body: { actionId: ACTION_ID, side: "left", startedAt: NOW } },
    ])
  await expect(page.getByText("Feeding now · Left side")).toBeVisible()
})

test("switches, pauses, resumes after a reload, and finishes, each with the tap time and the feed's version", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const household = await playHousehold(page, todayWith(runningFeed(andrew.id, STARTED, "left")))
  let feed = runningFeed(andrew.id, STARTED, "left")
  const next = (change: (sent: Sent) => Partial<FeedAnswer>) => (sent: Sent) => {
    feed = { ...feed, ...change(sent), version: feed.version + 1 }
    const shown = todayWith(feed.status === "active" ? feed : null)
    household.played.today = { ...shown, lastFeed: feed, recent: [{ kind: "feed", feed }] }
    return { status: 200, json: { feed, changed: [["today"]] } }
  }
  await household.answer(
    "**/api/feeds/feed-1/switch",
    next(({ body }) => ({
      segments: [
        ...closedAt(feed, body.occurredAt ?? 0),
        { id: "segment-2", side: "right", startedAt: body.occurredAt ?? 0, endedAt: null },
      ],
    })),
  )
  await household.answer(
    "**/api/feeds/feed-1/pause",
    next(({ body }) => ({ segments: closedAt(feed, body.occurredAt ?? 0) })),
  )
  await household.answer(
    "**/api/feeds/feed-1/resume",
    next(({ body }) => ({
      segments: [
        ...feed.segments,
        { id: "segment-3", side: body.side ?? "left", startedAt: body.occurredAt ?? 0, endedAt: null },
      ],
    })),
  )
  await household.answer(
    "**/api/feeds/feed-1/finish",
    next(({ body }) => ({
      status: "completed",
      endedAt: body.occurredAt ?? 0,
      segments: closedAt(feed, body.occurredAt ?? 0),
    })),
  )
  await openToday(page)
  await (await openNursing(page)).getByRole("button", { name: "Switch to Right" }).click()
  await page.clock.setFixedTime(NOW + MINUTE)
  await page.getByRole("dialog", { name: "Nursing" }).getByRole("button", { name: "Pause" }).click()
  await expect(page.getByRole("dialog", { name: "Nursing" }).getByText("Paused")).toBeVisible()
  await page.clock.setFixedTime(NOW + 2 * MINUTE)
  await page.reload()
  await expect(page.getByText("Feed paused")).toBeVisible()
  await (await openNursing(page)).getByRole("button", { name: "Left", exact: true }).click()
  await page.clock.setFixedTime(NOW + 3 * MINUTE)
  const running = page.getByRole("dialog", { name: "Nursing" })
  await expect(running.getByText("Left side")).toBeVisible()
  await running.getByRole("button", { name: "Finish" }).click()
  await running.getByRole("button", { name: "Finish feed" }).click()
  await expect
    .poll(() => household.played.sent.map(({ path, body }) => [path.split("/").at(-1), body.version, body.occurredAt]))
    .toEqual([
      ["switch", 1, NOW],
      ["pause", 2, NOW + MINUTE],
      ["resume", 3, NOW + 2 * MINUTE],
      ["finish", 4, NOW + 3 * MINUTE],
    ])
  await expect(page.getByText("Since last feed started")).toBeVisible()
})

test("finishes at a corrected stop time", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left", 2)
  const { played, answer } = await playHousehold(page, todayWith(feed))
  await answer("**/api/feeds/feed-1/finish", () => ({
    status: 200,
    json: { feed: { ...feed, status: "completed" }, changed: [] },
  }))
  await openToday(page)
  const sheet = await openNursing(page)
  await sheet.getByRole("button", { name: "Finish" }).click()
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Stopped").fill("2026-10-09T09:25")
  await sheet.getByRole("button", { name: "Finish feed" }).click()
  await expect
    .poll(() => played.sent.map(({ body }) => body))
    .toEqual([{ actionId: ACTION_ID, version: 2, occurredAt: NOW - 5 * MINUTE, deleteIfEmpty: false }])
})

test("offers to delete a feed that stopping at its start would leave empty", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const feed = runningFeed(andrew.id, STARTED, "left", 2)
  const { played, answer } = await playHousehold(page, todayWith(feed))
  await answer("**/api/feeds/feed-1/finish", ({ body }) =>
    body.deleteIfEmpty === true
      ? { status: 200, json: { feed: { ...feed, deletedAt: NOW, version: 3 }, changed: [["today"]] } }
      : { status: 409, json: { _tag: "Conflict", code: "FEED_EMPTY", current: feed } },
  )
  await openToday(page)
  const sheet = await openNursing(page)
  await sheet.getByRole("button", { name: "Finish" }).click()
  await sheet.getByRole("button", { name: "Change" }).click()
  await sheet.getByLabel("Stopped").fill("2026-10-09T09:20")
  await sheet.getByRole("button", { name: "Finish feed" }).click()
  await expect(sheet.getByText("Stopping at the start leaves nothing in this feed. Delete it?")).toBeVisible()
  await sheet.getByRole("button", { name: "Delete feed" }).click()
  await expect
    .poll(() => played.sent.map(({ body }) => [body.occurredAt, body.deleteIfEmpty]))
    .toEqual([
      [STARTED, false],
      [STARTED, true],
    ])
  expect(new Set(played.sent.map(({ body }) => body.actionId)).size).toBe(2)
  await expect(sheet).toBeHidden()
})

test("says who already started a feed, and shows theirs", async ({ page }) => {
  const { emily } = await caregiversOf(page)
  const theirs = runningFeed(emily.id, NOW - 5 * MINUTE, "right")
  const { played, answer } = await playHousehold(page, todayWith())
  await answer("**/api/feeds/start", () => {
    played.today = todayWith(theirs)
    return { status: 409, json: { _tag: "Conflict", code: "FEED_ALREADY_ACTIVE", current: theirs } }
  })
  await openToday(page)
  await (await openNursing(page)).getByRole("button", { name: "Left", exact: true }).click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await expect(sheet.getByRole("alert")).toHaveText(
    new RegExp(`^${emily.displayName.replace(/[()]/gu, "\\$&")} started a feed at 9:25\\sAM\\.$`, "u"),
  )
  await expect(sheet.getByText("Right side")).toBeVisible()
})

test("says who changed the running feed a moment ago, shows it as it is now, and lets that go with the next control", async ({
  page,
}) => {
  const { andrew, emily } = await caregiversOf(page)
  const mine = runningFeed(andrew.id, STARTED, "left", 2)
  const { played, answer } = await playHousehold(page, todayWith(mine))
  const theirs = {
    ...mine,
    version: 3,
    updatedBy: emily.id,
    segments: [{ id: "segment-1", side: "left" as const, startedAt: STARTED, endedAt: NOW - MINUTE }],
  }
  await answer("**/api/feeds/feed-1/switch", () => {
    played.today = todayWith(theirs)
    return { status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } }
  })
  await answer("**/api/feeds/feed-1/resume", ({ body }) => {
    const resumed = { side: body.side ?? "right", startedAt: body.occurredAt ?? NOW, endedAt: null }
    const feed = { ...theirs, version: 4, segments: [...theirs.segments, { id: "segment-2", ...resumed }] }
    played.today = todayWith(feed)
    return { status: 200, json: { feed, changed: [["today"]] } }
  })
  await openToday(page)
  await (await openNursing(page)).getByRole("button", { name: "Switch to Right" }).click()
  const sheet = page.getByRole("dialog", { name: "Nursing" })
  await expect(sheet.getByRole("alert")).toHaveText(`${emily.displayName} changed this feed a moment ago.`)
  await expect(sheet.getByText("Paused")).toBeVisible()
  expect(played.sent).toHaveLength(1)
  await sheet.getByRole("button", { name: "Right", exact: true }).click()
  await expect(sheet.getByText("Right side")).toBeVisible()
  await expect(sheet.getByRole("alert")).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  await expect(page.getByText("Discard this entry?")).toHaveCount(0)
  expect(played.sent.map(({ path, body }) => [path.split("/").at(-1), body.version])).toEqual([
    ["switch", 2],
    ["resume", 3],
  ])
})
