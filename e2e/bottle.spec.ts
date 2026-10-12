import { expect, type Page, test } from "@playwright/test"
import {
  caregiversOf,
  type FeedAnswer,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  runningFeed,
  todayWith,
} from "./played-household.ts"

const ACTION_ID = expect.stringMatching(/^[0-9a-f-]{36}$/u)
const LAST_BOTTLE = { lastBottle: { breastMilkMl: 40, formulaMl: 20 }, lastSide: null }
const HOUR = 3_600_000
const OLD_ACTION_ID = "00000000-0000-4000-8000-000000000000"

test.use({ timezoneId: "Europe/London" })

const feedSaved = (feed: FeedAnswer, status: number) => () => ({
  status,
  json: { feed, changed: [["today"], ["last24h"]] },
})

const bottleFeed = (by: string): FeedAnswer => ({
  ...runningFeed(by, NOW, "left"),
  id: "feed-2",
  status: "completed",
  endedAt: NOW,
  segments: [],
  portions: [{ id: "portion-1", occurredAt: NOW, breastMilkMl: 40, formulaMl: 20 }],
})

const openBottle = async (page: Page) => {
  await page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name: "Bottle" }).click()
  return page.getByRole("dialog", { name: "Bottle" })
}

const gate = () => {
  let open = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

const holdRequests = async (page: Page, pattern: string, until: () => Promise<void>) => {
  const held: string[] = []
  await page.route(pattern, async (route) => {
    held.push(route.request().url())
    await until()
    await route.fallback()
  })
  return held
}

const muteLiveUpdates = (page: Page) => page.routeWebSocket(/\/api\/ws$/, () => {})

test("saves the last bottle again in two taps", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const { played, answer } = await playHousehold(page, todayWith(null, LAST_BOTTLE))
  await answer("**/api/feeds", feedSaved(bottleFeed(andrew.id), 201))
  await openToday(page)
  const sheet = await openBottle(page)
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "POST",
        path: "/api/feeds",
        body: { actionId: ACTION_ID, segments: [], portions: [{ occurredAt: NOW, breastMilkMl: 40, formulaMl: 20 }] },
      },
    ])
  await expect(page.getByRole("status").filter({ hasText: "Bottle saved" })).toBeVisible()
})

test("in fl oz, shows the last bottle rounded, sends it back unchanged, and steps by half an ounce", async ({
  page,
}) => {
  const { andrew, me } = await caregiversOf(page)
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: { ...me, household: { ...me.household, units: { ...me.household.units, volume: "fl_oz" } } },
    }),
  )
  const prefill = { lastBottle: { breastMilkMl: 60, formulaMl: 0 }, lastSide: null }
  const { played, answer } = await playHousehold(page, todayWith(null, prefill))
  await answer("**/api/feeds", feedSaved(bottleFeed(andrew.id), 201))
  await openToday(page)
  const first = await openBottle(page)
  await expect(first.getByRole("textbox", { name: "Breast milk" })).toHaveValue("2.0")
  await first.getByRole("button", { name: "Save" }).click()
  const second = await openBottle(page)
  await second.getByRole("button", { name: "More breast milk" }).click()
  await expect(second.getByRole("textbox", { name: "Breast milk" })).toHaveValue("2.5")
  await second.getByRole("button", { name: "Save" }).click()
  await expect
    .poll(() => played.sent.map(({ body }) => JSON.stringify(body.portions)))
    .toEqual([
      JSON.stringify([{ occurredAt: NOW, breastMilkMl: 60, formulaMl: 0 }]),
      JSON.stringify([{ occurredAt: NOW, breastMilkMl: 73.9, formulaMl: 0 }]),
    ])
})

test("adds the bottle to the feed that's running, with that feed's version", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const running = runningFeed(andrew.id, NOW - 10 * MINUTE, "left", 3)
  const { played, answer } = await playHousehold(page, todayWith(running, LAST_BOTTLE))
  await answer("**/api/feeds/feed-1/bottle", feedSaved({ ...running, version: 4 }, 200))
  await openToday(page)
  const sheet = await openBottle(page)
  await expect(sheet.getByText(/^Adds to the feed that started at 9:20\sAM\.$/u)).toBeVisible()
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "POST",
        path: "/api/feeds/feed-1/bottle",
        body: { actionId: ACTION_ID, version: 3, occurredAt: NOW, breastMilkMl: 40, formulaMl: 20 },
      },
    ])
})

test("saves the changes to a bottle whose first save had landed, as an edit of its portion", async ({ page }) => {
  const { andrew } = await caregiversOf(page)
  const household = await playHousehold(page, todayWith(null, LAST_BOTTLE))
  const first = bottleFeed(andrew.id)
  const posted: Array<string | undefined> = []
  await page.route("**/api/feeds", (route) => {
    posted.push(route.request().postDataJSON().actionId)
    if (posted.length > 1) {
      return route.fulfill({ status: 409, json: { _tag: "Conflict", code: "ACTION_REPLAY_MISMATCH", current: first } })
    }
    household.played.today = { ...todayWith(null, LAST_BOTTLE), recent: [{ kind: "feed", feed: first }] }
    return route.abort("internetdisconnected")
  })
  await household.answer("**/api/portions/portion-1", ({ body }) => {
    const portion = {
      id: "portion-1",
      occurredAt: NOW,
      breastMilkMl: body.breastMilkMl ?? 0,
      formulaMl: body.formulaMl ?? 0,
    }
    const feed = { ...first, version: 2, portions: [portion] }
    household.played.today = { ...todayWith(null, LAST_BOTTLE), recent: [{ kind: "feed", feed }] }
    return { status: 200, json: { feed, changed: [["today"]] } }
  })
  await openToday(page)
  const sheet = await openBottle(page)
  await sheet.getByRole("button", { name: "Save", exact: true }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await sheet.getByRole("button", { name: "More breast milk" }).click()
  await sheet.getByRole("button", { name: "Save", exact: true }).click()
  const note = sheet.getByRole("alert")
  await expect(note.getByText("This was already saved as you first entered it.")).toBeVisible()
  await note.getByRole("button", { name: "Save my changes" }).click()
  await expect(sheet).toBeHidden()
  expect(posted).toEqual([ACTION_ID, posted[0]])
  expect(household.played.sent).toEqual([
    {
      method: "PATCH",
      path: "/api/portions/portion-1",
      body: { actionId: ACTION_ID, version: 1, occurredAt: NOW, breastMilkMl: 50, formulaMl: 20 },
    },
  ])
  expect(household.played.sent[0]?.body.actionId).not.toBe(posted[0])
})

test("says Saving… on the feed while a bottle added to it is on its way, and holds the next Save until it lands", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const running = runningFeed(andrew.id, NOW - 10 * MINUTE, "left", 3)
  const portion = { id: "portion-1", occurredAt: NOW, breastMilkMl: 40, formulaMl: 20 }
  const topped = { ...running, version: 4, portions: [portion] }
  const saved = feedSaved(topped, 200)
  const { played, answer } = await playHousehold(page, todayWith(running, LAST_BOTTLE))
  await answer("**/api/feeds/feed-1/bottle", () => {
    played.today = todayWith(topped, LAST_BOTTLE)
    return saved()
  })
  const answered = gate()
  const held = await holdRequests(page, "**/api/feeds/feed-1/bottle", () => answered.opened)
  await muteLiveUpdates(page)
  await openToday(page)
  const first = await openBottle(page)
  await first.getByRole("button", { name: "Save" }).click()
  await expect.poll(() => held.length).toBe(1)
  await expect(page.getByText("Saving…")).toBeVisible()
  const second = await openBottle(page)
  await expect(second.getByRole("button", { name: "Save" })).toBeDisabled()
  answered.open()
  await expect(second.getByRole("button", { name: "Save" })).toBeEnabled()
  await expect(page.getByText("Saving…")).toHaveCount(0)
})

test("opens a draft's Bottle sheet once Today loads, then logs a bottle from before the running feed as its own feed", async ({
  page,
}) => {
  const { andrew } = await caregiversOf(page)
  const running = runningFeed(andrew.id, NOW - 10 * MINUTE, "left", 3)
  const kept = NOW - 13 * HOUR
  const draft = {
    route: "/",
    sending: {
      sheet: "bottle",
      action: {
        kind: "addBottle",
        id: "feed-1",
        payload: { actionId: OLD_ACTION_ID, version: 3, occurredAt: kept, breastMilkMl: 40, formulaMl: 20 },
      },
    },
    createdAt: kept,
  }
  await page.addInitScript((stored) => sessionStorage.setItem("bt.draft", stored), JSON.stringify(draft))
  const { played, answer } = await playHousehold(page, todayWith(running, LAST_BOTTLE))
  await answer("**/api/feeds", feedSaved(bottleFeed(andrew.id), 201))
  const loaded = gate()
  const held = await holdRequests(page, "**/api/today", () => loaded.opened)
  await muteLiveUpdates(page)
  await page.clock.setFixedTime(NOW)
  await page.goto("/")
  await expect(page.getByText("Robin")).toBeVisible()
  await expect.poll(() => held.length).toBeGreaterThan(0)
  const sheet = page.getByRole("dialog", { name: "Bottle" })
  await expect(sheet).toHaveCount(0)
  loaded.open()
  await expect(sheet.getByRole("button", { name: "Save", exact: true })).toBeVisible()
  await expect(sheet.getByText(/^Adds to the feed/u)).toHaveCount(0)
  await sheet.getByRole("button", { name: "Save", exact: true }).click()
  await expect
    .poll(() => played.sent)
    .toEqual([
      {
        method: "POST",
        path: "/api/feeds",
        body: {
          actionId: ACTION_ID,
          segments: [],
          portions: [{ occurredAt: kept, breastMilkMl: 40, formulaMl: 20 }],
        },
      },
    ])
})
