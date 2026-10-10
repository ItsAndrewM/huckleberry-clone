import { expect, type Page, test } from "@playwright/test"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const NOW = Date.UTC(2026, 9, 9, 16, 30)

interface CaregiverName {
  readonly id: string
  readonly displayName: string
}

const NO_TOTALS = {
  feedsStarted: 0,
  leftSeconds: 0,
  rightSeconds: 0,
  nursingSeconds: 0,
  breastMilkMl: 0,
  formulaMl: 0,
  bottleMl: 0,
  diapers: 0,
  wetDiapers: 0,
  dirtyDiapers: 0,
}

type Totals = typeof NO_TOTALS

const audit = (at: number, by: string) => ({
  version: 1,
  createdBy: by,
  createdAt: at,
  updatedBy: by,
  updatedAt: at,
  deletedAt: null,
})

interface Segment {
  readonly id: string
  readonly side: string
  readonly startedAt: number
  readonly endedAt: number | null
}

interface Portion {
  readonly id: string
  readonly occurredAt: number
  readonly breastMilkMl: number
  readonly formulaMl: number
}

interface FeedParts {
  readonly segments?: ReadonlyArray<Segment>
  readonly portions?: ReadonlyArray<Portion>
  readonly active?: boolean
}

const segment = (id: string, side: string, startedAt: number, minutes: number | null): Segment => ({
  id,
  side,
  startedAt,
  endedAt: minutes === null ? null : startedAt + minutes * MINUTE,
})

const feed = (startedAt: number, by: string, parts: FeedParts) => ({
  id: `feed-${startedAt}`,
  status: parts.active === true ? "active" : "completed",
  startedAt,
  endedAt: parts.active === true ? null : startedAt + 21 * MINUTE,
  segments: parts.segments ?? [],
  portions: parts.portions ?? [],
  ...audit(startedAt, by),
})

type FeedAnswer = ReturnType<typeof feed>

interface TodayChange {
  readonly totals?: Totals
  readonly activeFeed?: FeedAnswer
  readonly lastFeed?: FeedAnswer
  readonly recent?: ReadonlyArray<{ readonly kind: string }>
}

const todayWith = (change: TodayChange) => ({
  date: "2026-10-09",
  totals: NO_TOTALS,
  activeFeed: null,
  lastFeed: null,
  prefill: { lastBottle: null, lastSide: null },
  recent: [],
  ...change,
})

const caregiversOf = async (page: Page): Promise<readonly [CaregiverName, CaregiverName]> => {
  const me = await (await page.request.get("/api/me")).json()
  return me.household.caregivers
}

const playToday = async (page: Page, today: ReturnType<typeof todayWith>, last24hTotals = NO_TOTALS) => {
  await page.route("**/api/today", (route) => route.fulfill({ json: today }))
  await page.route("**/api/last24h", (route) => route.fulfill({ json: { from: NOW - DAY, totals: last24hTotals } }))
}

const openToday = async (page: Page) => {
  await page.clock.setFixedTime(NOW)
  await page.goto("/")
}

const LAST_FEED_AT = NOW - 135 * MINUTE

test.describe("Today, with the household's answers played by the test", () => {
  test("shows how long since the last feed started, counting on, with what that feed held", async ({ page }) => {
    const [andrew] = await caregiversOf(page)
    const lastFeed = feed(LAST_FEED_AT, andrew.id, {
      segments: [segment("s1", "left", LAST_FEED_AT, 12), segment("s2", "right", LAST_FEED_AT + 12 * MINUTE, 8)],
      portions: [{ id: "p1", occurredAt: LAST_FEED_AT + 20 * MINUTE, breastMilkMl: 40, formulaMl: 20 }],
    })
    await playToday(page, todayWith({ lastFeed }))
    await openToday(page)
    await expect(page.getByText("Since last feed started")).toBeVisible()
    await expect(page.getByText("2 h 15 min")).toBeVisible()
    await expect(page.getByText(/7:15\sAM · Left 12 min · Right 8 min · 60 mL/)).toBeVisible()
    await page.clock.setFixedTime(NOW + MINUTE)
    await expect(page.getByText("2 h 16 min")).toBeVisible()
  })

  test("counts a running feed up each second, with the side being nursed", async ({ page }) => {
    const [andrew] = await caregiversOf(page)
    const startedAt = NOW - 7 * MINUTE - 25_000
    const running = feed(startedAt, andrew.id, { active: true, segments: [segment("s1", "left", startedAt, null)] })
    await playToday(page, todayWith({ activeFeed: running, lastFeed: running }))
    await openToday(page)
    await expect(page.getByText("Feeding now · Left side")).toBeVisible()
    await expect(page.getByRole("timer")).toHaveText("7:25")
    await page.clock.setFixedTime(NOW + 1_000)
    await expect(page.getByRole("timer")).toHaveText("7:26")
  })

  test("shows a paused feed's nursing without counting on", async ({ page }) => {
    const [andrew] = await caregiversOf(page)
    const startedAt = NOW - 30 * MINUTE
    const paused = feed(startedAt, andrew.id, { active: true, segments: [segment("s1", "right", startedAt, 12)] })
    await playToday(page, todayWith({ activeFeed: paused, lastFeed: paused }))
    await openToday(page)
    await expect(page.getByText("Feed paused")).toBeVisible()
    await expect(page.getByText("12:00")).toBeVisible()
    await page.clock.setFixedTime(NOW + 5_000)
    await expect(page.getByText("12:00")).toBeVisible()
  })
})
