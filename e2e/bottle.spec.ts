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
  const prefill = { lastBottle: { breastMilkMl: 59.1, formulaMl: 0 }, lastSide: null }
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
      JSON.stringify([{ occurredAt: NOW, breastMilkMl: 59.1, formulaMl: 0 }]),
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
