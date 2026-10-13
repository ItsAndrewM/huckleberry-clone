import type { Page, Request } from "@playwright/test"

export const MINUTE = 60_000
export const NOW = Date.UTC(2026, 9, 9, 16, 30)
const DAY = 24 * 60 * MINUTE

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
  sleepsStarted: 0,
  sleepSeconds: 0,
  napSeconds: 0,
  nightSeconds: 0,
  longestSleepSeconds: 0,
}

type Side = "left" | "right"

interface Segment {
  readonly id: string
  readonly side: Side
  readonly startedAt: number
  readonly endedAt: number | null
}

interface Portion {
  readonly id: string
  readonly occurredAt: number
  readonly breastMilkMl: number
  readonly formulaMl: number
}

export interface FeedAnswer {
  readonly id: string
  readonly status: "active" | "completed"
  readonly startedAt: number
  readonly endedAt: number | null
  readonly segments: ReadonlyArray<Segment>
  readonly portions: ReadonlyArray<Portion>
  readonly version: number
  readonly createdBy: string
  readonly createdAt: number
  readonly updatedBy: string
  readonly updatedAt: number
  readonly deletedAt: number | null
}

export const runningFeed = (by: string, startedAt: number, side: Side, version = 1): FeedAnswer => ({
  id: "feed-1",
  status: "active",
  startedAt,
  endedAt: null,
  segments: [{ id: "segment-1", side, startedAt, endedAt: null }],
  portions: [],
  version,
  createdBy: by,
  createdAt: startedAt,
  updatedBy: by,
  updatedAt: startedAt,
  deletedAt: null,
})

interface Prefill {
  readonly lastBottle: { readonly breastMilkMl: number; readonly formulaMl: number } | null
  readonly lastSide: Side | null
}

const NO_PREFILL: Prefill = { lastBottle: null, lastSide: null }

interface DiaperAnswer {
  readonly id: string
  readonly occurredAt: number
  readonly wet: boolean
  readonly dirty: boolean
  readonly version: number
  readonly createdBy: string
  readonly createdAt: number
  readonly updatedBy: string
  readonly updatedAt: number
  readonly deletedAt: number | null
}

type RecentAnswer =
  | { readonly kind: "feed"; readonly feed: FeedAnswer }
  | { readonly kind: "diaper"; readonly diaper: DiaperAnswer }

export interface TodayAnswer {
  readonly date: string
  readonly totals: typeof NO_TOTALS
  readonly activeFeed: FeedAnswer | null
  readonly lastFeed: FeedAnswer | null
  readonly activeSleep: null
  readonly lastSleep: null
  readonly prefill: Prefill
  readonly recent: ReadonlyArray<RecentAnswer>
  readonly doses: ReadonlyArray<never>
}

export const todayWith = (activeFeed: FeedAnswer | null = null, prefill = NO_PREFILL): TodayAnswer => ({
  date: "2026-10-09",
  totals: NO_TOTALS,
  activeFeed,
  lastFeed: activeFeed,
  activeSleep: null,
  lastSleep: null,
  prefill,
  recent: activeFeed === null ? [] : [{ kind: "feed", feed: activeFeed }],
  doses: [],
})

interface SentSegment {
  readonly side: Side
  readonly startedAt: number
  readonly endedAt: number
}

interface SentPortion {
  readonly occurredAt: number
  readonly breastMilkMl: number
  readonly formulaMl: number
}

interface Body {
  readonly actionId?: string
  readonly version?: number
  readonly occurredAt?: number
  readonly startedAt?: number
  readonly side?: Side
  readonly wet?: boolean
  readonly dirty?: boolean
  readonly deleteIfEmpty?: boolean
  readonly breastMilkMl?: number
  readonly formulaMl?: number
  readonly segments?: ReadonlyArray<SentSegment>
  readonly portions?: ReadonlyArray<SentPortion>
}

export interface Sent {
  readonly method: string
  readonly path: string
  readonly body: Body
}

interface Answer {
  readonly status: number
  readonly json: object
}

export const caregiversOf = async (page: Page) => {
  const me = await (await page.request.get("/api/me")).json()
  const [andrew, emily] = me.household.caregivers
  return { andrew, emily, me }
}

const sentOf = (request: Request): Sent => ({
  method: request.method(),
  path: new URL(request.url()).pathname,
  body: request.postDataJSON() ?? {},
})

export const playHousehold = async (page: Page, initial: TodayAnswer) => {
  const sent: Sent[] = []
  const played = { today: initial, sent }
  await page.route("**/api/today", (route) => route.fulfill({ json: played.today }))
  await page.route("**/api/last24h", (route) => route.fulfill({ json: { from: NOW - DAY, totals: NO_TOTALS } }))
  const answer = (pattern: string, reply: (request: Sent) => Answer) =>
    page.route(pattern, async (route) => {
      const request = sentOf(route.request())
      sent.push(request)
      const { status, json } = reply(request)
      await route.fulfill({ status, json })
    })
  return { played, answer }
}

export const openToday = async (page: Page) => {
  await page.clock.setFixedTime(NOW)
  await page.goto("/")
  await page.getByText("Totals").waitFor()
}

export const quickAction = (page: Page, name: string) =>
  page.getByRole("region", { name: "Log", exact: true }).getByRole("button", { name })

export const gate = () => {
  let open = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

export const holdRequests = async (page: Page, pattern: string, until: () => Promise<void>) => {
  const held: string[] = []
  await page.route(pattern, async (route) => {
    held.push(route.request().url())
    await until()
    await route.fallback()
  })
  return held
}

export const muteLiveUpdates = (page: Page) => page.routeWebSocket(/\/api\/ws$/u, () => {})

export const savedBy = (by: string) => ({
  version: 1,
  createdBy: by,
  createdAt: NOW,
  updatedBy: by,
  updatedAt: NOW,
  deletedAt: null,
})

export const savedDiaper = (by: string) => (body: Body) => ({
  diaper: {
    id: `diaper-${body.actionId}`,
    occurredAt: body.occurredAt ?? NOW,
    wet: body.wet ?? true,
    dirty: body.dirty ?? false,
    ...savedBy(by),
  },
  changed: [["today"]],
})

interface LostSaves {
  readonly lost: number
  readonly until: Promise<void>
  readonly answer: (body: Body) => object
}

export const loseSaves = async (page: Page, pattern: string, { lost, until, answer }: LostSaves) => {
  const bodies: Body[] = []
  await page.route(pattern, async (route) => {
    const { body } = sentOf(route.request())
    bodies.push(body)
    if (bodies.length > lost) return route.fulfill({ status: 201, json: answer(body) })
    await until
    return route.abort("internetdisconnected")
  })
  return bodies
}
