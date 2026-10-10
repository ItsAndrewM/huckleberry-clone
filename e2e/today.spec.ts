import { expect, type Locator, type Page, test } from "@playwright/test"

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

const TOTALS: Totals = {
  feedsStarted: 6,
  leftSeconds: 42 * 60,
  rightSeconds: 38 * 60,
  nursingSeconds: 80 * 60,
  breastMilkMl: 120,
  formulaMl: 60,
  bottleMl: 180,
  diapers: 5,
  wetDiapers: 4,
  dirtyDiapers: 2,
}

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

const inOrder = (...parts: ReadonlyArray<string>) =>
  new RegExp(parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s")).join(".*"))

const total = (page: Page, label: string) =>
  page.locator("dl > div").filter({ has: page.getByRole("term").filter({ hasText: label }) })

const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (box === null) throw new Error(`${locator} isn't on screen to measure`)
  return box
}

const LAST_FEED_AT = NOW - 135 * MINUTE

test.use({ timezoneId: "Europe/London" })

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
    await page.clock.install({ time: NOW })
    await page.goto("/")
    await expect(page.getByText("Feed paused")).toBeVisible()
    await expect(page.getByText("12:00")).toBeVisible()
    await page.clock.runFor(5_000)
    await expect(page.getByText("12:00")).toBeVisible()
  })

  test("totals today, and the last 24 hours on the switch", async ({ page }) => {
    await playToday(page, todayWith({ totals: TOTALS }), { ...TOTALS, feedsStarted: 9, diapers: 8 })
    await openToday(page)
    await expect(total(page, "Feeds started")).toContainText("6")
    await expect(total(page, "Nursing")).toContainText("1 h 20 min")
    await expect(total(page, "Nursing")).toContainText("Left 42 min · Right 38 min")
    await expect(total(page, "Bottles")).toContainText("180 mL")
    await expect(total(page, "Bottles")).toContainText("Breast milk 120 mL · Formula 60 mL")
    await expect(total(page, "Diapers")).toContainText("5")
    await expect(total(page, "Diapers")).toContainText("4 pee · 2 poo")
    await page.getByRole("button", { name: "Last 24 h" }).click()
    await expect(total(page, "Feeds started")).toContainText("9")
    await expect(total(page, "Diapers")).toContainText("8")
    await page.getByRole("button", { name: "Today", exact: true }).click()
    await expect(total(page, "Feeds started")).toContainText("6")
    await expect(total(page, "Diapers")).toContainText("5")
  })

  test("shows bottles in fl oz wherever one appears, when the household uses them", async ({ page }) => {
    const me = await (await page.request.get("/api/me")).json()
    const [andrew] = await caregiversOf(page)
    await page.route("**/api/me", (route) =>
      route.fulfill({
        json: { ...me, household: { ...me.household, units: { ...me.household.units, volume: "fl_oz" } } },
      }),
    )
    const lastFeed = feed(LAST_FEED_AT, andrew.id, {
      portions: [{ id: "p1", occurredAt: LAST_FEED_AT, breastMilkMl: 40, formulaMl: 20 }],
    })
    const recent = [{ kind: "feed", feed: lastFeed }]
    await playToday(page, todayWith({ totals: TOTALS, lastFeed, recent }))
    await openToday(page)
    await expect(total(page, "Bottles")).toContainText("6.1 fl oz")
    await expect(page.getByText(/7:15\sAM · 2\.0 fl oz/)).toBeVisible()
    await expect(page.getByRole("list", { name: "Last 24 hours" }).getByRole("listitem")).toHaveText([
      inOrder("Bottle", "2.0 fl oz", "7:15 AM", andrew.displayName),
    ])
  })

  test("says so when the last 24 hours can't be loaded", async ({ page }) => {
    await playToday(page, todayWith({ totals: TOTALS }))
    await page.route("**/api/last24h", (route) => route.abort())
    await openToday(page)
    await page.getByRole("button", { name: "Last 24 h" }).click()
    await expect(page.getByText("The last 24 hours couldn't be loaded.")).toBeVisible()
  })

  test("says so when the household's details can't be loaded, though today's answer arrived", async ({ page }) => {
    await playToday(page, todayWith({ totals: TOTALS }))
    await page.route("**/api/me", (route) => route.fulfill({ status: 404 }))
    await openToday(page)
    await expect(page.getByText("Today couldn't be loaded.")).toBeVisible()
  })

  test("lists the last 24 hours with who logged each, leaving out kinds this app doesn't know yet", async ({
    page,
  }) => {
    const [andrew, emily] = await caregiversOf(page)
    const bottleAt = NOW - 265 * MINUTE
    const recent = [
      {
        kind: "diaper",
        diaper: { id: "d1", occurredAt: NOW - 50 * MINUTE, wet: true, dirty: false, ...audit(NOW, emily.id) },
      },
      { kind: "sleep", sleep: { id: "sleep-1" } },
      {
        kind: "feed",
        feed: feed(LAST_FEED_AT, andrew.id, {
          segments: [segment("s1", "left", LAST_FEED_AT, 12)],
          portions: [{ id: "p1", occurredAt: LAST_FEED_AT, breastMilkMl: 40, formulaMl: 20 }],
        }),
      },
      {
        kind: "feed",
        feed: feed(bottleAt, emily.id, {
          portions: [{ id: "p2", occurredAt: bottleAt, breastMilkMl: 0, formulaMl: 120 }],
        }),
      },
    ]
    await playToday(page, todayWith({ recent }))
    await openToday(page)
    await expect(page.getByRole("list", { name: "Last 24 hours" }).getByRole("listitem")).toHaveText([
      inOrder("Diaper", "Pee", "8:40 AM", emily.displayName),
      inOrder("Nursing and bottle", "Left 12 min · 60 mL", "7:15 AM", andrew.displayName),
      inOrder("Bottle", "120 mL", "5:05 AM", emily.displayName),
    ])
  })

  test("says so when nothing has been logged", async ({ page }) => {
    await playToday(page, todayWith({}))
    await openToday(page)
    await expect(page.getByText("No feeds yet")).toBeVisible()
    await expect(page.getByText("Nothing logged in the last 24 hours.")).toBeVisible()
    await expect(total(page, "Feeds started")).toContainText("0")
  })

  test("keeps the quick actions above the tabs, ready for the sheets in M1.12", async ({ page }) => {
    await playToday(page, todayWith({}))
    await openToday(page)
    const actions = page.getByRole("region", { name: "Log", exact: true }).getByRole("button")
    await expect(actions).toHaveText(["Bottle", "Nursing", "Diaper"])
    for (const action of await actions.all()) await expect(action).toBeDisabled()
  })

  test("fits the quick actions on a 360-pixel-wide phone, resting on the tab bar", async ({ page }) => {
    const width = 360
    const gutter = 16
    await page.setViewportSize({ width, height: 640 })
    await playToday(page, todayWith({}))
    await openToday(page)
    const log = page.getByRole("region", { name: "Log", exact: true })
    const bottle = await boxOf(log.getByRole("button", { name: "Bottle" }))
    const diaper = await boxOf(log.getByRole("button", { name: "Diaper" }))
    const bar = await boxOf(log)
    const tabs = await boxOf(page.getByRole("navigation", { name: "Main" }))
    expect(bottle.x).toBeGreaterThanOrEqual(gutter)
    expect(diaper.x + diaper.width).toBeLessThanOrEqual(width - gutter)
    expect(Math.abs(bar.y + bar.height - tabs.y)).toBeLessThanOrEqual(1)
  })
})

test("shows a diaper the other phone just logged, without a reload", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Feeds started")).toBeVisible()
  const occurredAt = Date.now() - 3 * MINUTE - Math.floor(Math.random() * MINUTE)
  const logged = await page.request.post("/api/diapers", {
    data: { actionId: crypto.randomUUID(), occurredAt, wet: false, dirty: true },
  })
  expect(logged.status()).toBe(201)
  const entry = page
    .getByRole("listitem")
    .filter({ has: page.locator(`time[datetime="${new Date(occurredAt).toISOString()}"]`) })
  await expect(entry).toContainText("Poo")
})
