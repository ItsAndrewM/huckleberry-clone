import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test"
import {
  caregiversOf,
  type DoseAnswer,
  type FeedAnswer,
  MINUTE,
  muteLiveUpdates,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  runningFeed,
  runningSleep,
  savedDiaper,
  type SleepAnswer,
  sleepingToday,
  type TodayAnswer,
  todayWith,
} from "./played-household.ts"

test.use({ timezoneId: "Europe/London" })

const FIRST_TAP = NOW + 37_000
const SIGNAL_BACK = FIRST_TAP + 15 * MINUTE
const STARTED = NOW - 10 * MINUTE

interface Body {
  readonly actionId?: string
  readonly occurredAt?: number
  readonly startedAt?: number
  readonly measuredAt?: number
  readonly side?: string
  readonly supplementId?: string
  readonly portions?: ReadonlyArray<{ readonly occurredAt: number }>
}

interface Answer {
  readonly status: number
  readonly json: object
}

interface Phone {
  offline: boolean
  readonly bodies: Body[]
}

const playSends = async (page: Page, pattern: string | RegExp, answer: (body: Body) => Answer) => {
  const phone: Phone = { offline: true, bodies: [] }
  await page.route(pattern, async (route) => {
    if (route.request().method() === "GET") return route.fallback()
    const body: Body = route.request().postDataJSON() ?? {}
    phone.bodies.push(body)
    if (phone.offline) return route.abort("internetdisconnected")
    return route.fulfill(answer(body))
  })
  return phone
}

const goOfflineLikeAPhone = async (page: Page, context: BrowserContext) => {
  await page.routeWebSocket(/\/api\/ws$/u, (socket) => socket.close({ code: 1011, reason: "offline" }))
  await context.setOffline(true)
  await expect(page.getByRole("alert").filter({ hasText: "No connection" }).first()).toBeVisible()
}

const comeBackOnline = async (page: Page, context: BrowserContext, phone: Phone) => {
  await page.clock.setFixedTime(SIGNAL_BACK)
  await context.setOffline(false)
  phone.offline = false
}

const sentOnce = (phone: Phone) => new Set(phone.bodies.map(({ actionId }) => actionId)).size === 1

const openSheet = async (page: Page, action: string) => {
  await quickAction(page, action).click()
  return page.getByRole("dialog", { name: action })
}

const savedFeed = (feed: FeedAnswer, status = 200): Answer => ({ status, json: { feed, changed: [["today"]] } })

const savedSleep = (sleep: SleepAnswer, status = 200): Answer => ({ status, json: { sleep, changed: [["today"]] } })

const savedDose = (by: string, body: Body): Answer => {
  const dose: DoseAnswer = {
    id: "dose-1",
    supplementId: body.supplementId ?? "",
    occurredAt: body.occurredAt ?? NOW,
    localDate: "2026-10-09",
    dose: "400 IU",
    version: 1,
    createdBy: by,
    createdAt: NOW,
    updatedBy: by,
    updatedAt: NOW,
    deletedAt: null,
  }
  return { status: 201, json: { dose, changed: [["today"]] } }
}

interface Form {
  readonly name: string
  readonly today: (by: string) => TodayAnswer
  readonly route: string
  readonly answer: (by: string) => (body: Body) => Answer
  readonly open: (page: Page) => Promise<Locator>
  readonly save: string
  readonly timeOf: (body: Body | undefined) => number | undefined
}

const FORMS: ReadonlyArray<Form> = [
  {
    name: "Start sleep",
    today: () => todayWith(),
    route: "**/api/sleeps/start",
    answer: (by) => (body) => savedSleep(runningSleep(by, body.startedAt ?? NOW), 201),
    open: (page) => openSheet(page, "Sleep"),
    save: "Start sleep",
    timeOf: (body) => body?.startedAt,
  },
  {
    name: "Wake up",
    today: (by) => sleepingToday(runningSleep(by, STARTED)),
    route: "**/api/sleeps/sleep-1/wake",
    answer: (by) => (body) => savedSleep({ ...runningSleep(by, STARTED), endedAt: body.occurredAt ?? NOW, version: 2 }),
    open: (page) => openSheet(page, "Sleep"),
    save: "Wake up",
    timeOf: (body) => body?.occurredAt,
  },
  {
    name: "Start nursing",
    today: () => todayWith(null, { lastBottle: null, lastSide: "right" }),
    route: "**/api/feeds/start",
    answer: (by) => (body) => savedFeed(runningFeed(by, body.startedAt ?? NOW, "left"), 201),
    open: (page) => openSheet(page, "Nursing"),
    save: "Left",
    timeOf: (body) => body?.startedAt,
  },
  {
    name: "Finish feed",
    today: (by) => todayWith(runningFeed(by, STARTED, "left")),
    route: "**/api/feeds/feed-1/finish",
    answer: (by) => (body) =>
      savedFeed({ ...runningFeed(by, STARTED, "left"), status: "completed", endedAt: body.occurredAt ?? NOW }),
    open: async (page) => {
      const sheet = await openSheet(page, "Nursing")
      await sheet.getByRole("button", { name: "Finish", exact: true }).click()
      return sheet
    },
    save: "Finish feed",
    timeOf: (body) => body?.occurredAt,
  },
  {
    name: "Bottle",
    today: () => todayWith(null, { lastBottle: { breastMilkMl: 40, formulaMl: 20 }, lastSide: null }),
    route: "**/api/feeds",
    answer: (by) => () => savedFeed({ ...runningFeed(by, NOW, "left"), id: "feed-2", status: "completed" }, 201),
    open: (page) => openSheet(page, "Bottle"),
    save: "Save",
    timeOf: (body) => body?.portions?.[0]?.occurredAt,
  },
  {
    name: "Diaper",
    today: () => todayWith(),
    route: "**/api/diapers",
    answer: (by) => (body) => ({ status: 201, json: savedDiaper(by)({ occurredAt: body.occurredAt ?? NOW }) }),
    open: (page) => openSheet(page, "Diaper"),
    save: "Pee",
    timeOf: (body) => body?.occurredAt,
  },
  {
    name: "Log Vitamin D",
    today: () => todayWith(),
    route: "**/api/doses",
    answer: (by) => (body) => savedDose(by, body),
    open: async (page) => {
      await page
        .getByRole("list", { name: "Supplements" })
        .getByRole("button", { name: /^Vitamin D/u })
        .click()
      return page.getByRole("dialog", { name: "Vitamin D" })
    },
    save: "Log Vitamin D",
    timeOf: (body) => body?.occurredAt,
  },
]

for (const form of FORMS) {
  test(`${form.name}, tapped again after its send failed offline, saves the first tap's time`, async ({
    page,
    context,
  }) => {
    const { andrew } = await caregiversOf(page)
    await playHousehold(page, form.today(andrew.id))
    const phone = await playSends(page, form.route, form.answer(andrew.id))
    await muteLiveUpdates(page)
    await openToday(page)
    await goOfflineLikeAPhone(page, context)
    await page.clock.setFixedTime(FIRST_TAP)
    const sheet = await form.open(page)
    await sheet.getByRole("button", { name: form.save, exact: true }).click()
    await expect(sheet.getByRole("alert")).toContainText("No connection")
    await comeBackOnline(page, context, phone)
    await sheet.getByRole("button", { name: form.save, exact: true }).click()
    await expect.poll(() => phone.bodies.length).toBe(2)
    expect(form.timeOf(phone.bodies[1])).toBe(FIRST_TAP)
    expect(sentOnce(phone)).toBe(true)
  })
}

test("Add measurement, tapped again after its send failed offline, saves the first tap's time", async ({
  page,
  context,
}) => {
  await page.route(/\/api\/growth$/u, (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { measurements: [] } }) : route.fallback(),
  )
  const phone = await playSends(page, /\/api\/growth$/u, (body) => ({
    status: 201,
    json: {
      measurement: {
        id: "measurement-1",
        measuredAt: body.measuredAt ?? NOW,
        weightG: 4500,
        lengthCm: null,
        headCm: null,
        version: 1,
        createdBy: "caregiver-andrew",
        createdAt: NOW,
        updatedBy: "caregiver-andrew",
        updatedAt: NOW,
        deletedAt: null,
      },
      changed: [["growth"]],
    },
  }))
  await muteLiveUpdates(page)
  await page.clock.setFixedTime(NOW)
  await page.goto("/growth")
  await page.getByRole("button", { name: "Add measurement" }).waitFor()
  await goOfflineLikeAPhone(page, context)
  await page.clock.setFixedTime(FIRST_TAP)
  await page.getByRole("button", { name: "Add measurement" }).click()
  const sheet = page.getByRole("dialog", { name: "Add measurement" })
  await sheet.getByRole("textbox", { name: "Weight" }).fill("4.5")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(sheet.getByRole("alert")).toContainText("No connection")
  await comeBackOnline(page, context, phone)
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect.poll(() => phone.bodies.length).toBe(2)
  expect(phone.bodies[1]?.measuredAt).toBe(FIRST_TAP)
  expect(sentOnce(phone)).toBe(true)
})

const pausedFeed = (by: string): FeedAnswer => {
  const feed = runningFeed(by, STARTED, "left")
  return { ...feed, segments: feed.segments.map((segment) => ({ ...segment, endedAt: NOW - 5 * MINUTE })) }
}

interface Control {
  readonly name: string
  readonly feed: (by: string) => FeedAnswer
  readonly route: string
  readonly first: RegExp
  readonly again: RegExp
  readonly side?: string
}

const CONTROLS: ReadonlyArray<Control> = [
  {
    name: "Pause",
    feed: (by) => runningFeed(by, STARTED, "left"),
    route: "**/api/feeds/feed-1/pause",
    first: /^Pause$/u,
    again: /^Pause$/u,
  },
  {
    name: "Switch",
    feed: (by) => runningFeed(by, STARTED, "left"),
    route: "**/api/feeds/feed-1/switch",
    first: /^Switch to Right$/u,
    again: /^Switch to Right$/u,
  },
  {
    name: "Resume, on the other side the second time,",
    feed: pausedFeed,
    route: "**/api/feeds/feed-1/resume",
    first: /^Right/u,
    again: /^Left/u,
    side: "left",
  },
  {
    name: "A paused feed's Finish",
    feed: pausedFeed,
    route: "**/api/feeds/feed-1/finish",
    first: /^Finish$/u,
    again: /^Finish$/u,
  },
]

for (const control of CONTROLS) {
  test(`${control.name} tapped again after its send failed saves the first tap's time`, async ({ page }) => {
    const { andrew } = await caregiversOf(page)
    const feed = control.feed(andrew.id)
    await playHousehold(page, todayWith(feed))
    const phone = await playSends(page, control.route, () => savedFeed({ ...feed, version: 2 }))
    await muteLiveUpdates(page)
    await openToday(page)
    await page.clock.setFixedTime(FIRST_TAP)
    const sheet = await openSheet(page, "Nursing")
    await sheet.getByRole("button", { name: control.first }).click()
    await expect(sheet.getByRole("alert")).toContainText("No connection")
    await page.clock.setFixedTime(SIGNAL_BACK)
    phone.offline = false
    await sheet.getByRole("button", { name: control.again }).click()
    await expect.poll(() => phone.bodies.length).toBe(2)
    expect(phone.bodies[1]?.occurredAt).toBe(FIRST_TAP)
    expect(phone.bodies[1]?.side).toBe(control.side ?? phone.bodies[0]?.side)
    expect(sentOnce(phone)).toBe(true)
  })
}
