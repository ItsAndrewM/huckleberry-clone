import type { Page } from "@playwright/test"

export const NOW = Date.UTC(2026, 9, 9, 16, 30)
export const DAY = "2026-10-09"
export const BIRTH_DATE = "2026-09-01"
const HOUR = 3_600_000

export const local = (time: string, date = DAY, offset = "-07:00") => Date.parse(`${date}T${time}:00${offset}`)

const audit = (at: number, by: string) => ({
  version: 1,
  createdBy: by,
  createdAt: at,
  updatedBy: by,
  updatedAt: at,
  deletedAt: null,
})

export interface SideAt {
  readonly side: "left" | "right"
  readonly from: number
  readonly to: number | null
}

export type Portion = readonly [at: number, breastMilkMl: number, formulaMl: number]

export const feed = (id: string, by: string, sides: ReadonlyArray<SideAt>, portions: ReadonlyArray<Portion> = []) => {
  const times = [...sides.map(({ from }) => from), ...portions.map(([at]) => at)]
  const ends = [...sides.map(({ to }) => to), ...portions.map(([at]) => at)]
  const running = ends.includes(null)
  return {
    id,
    status: running ? "active" : "completed",
    startedAt: Math.min(...times),
    endedAt: running ? null : Math.max(...ends.map((end) => end ?? 0)),
    segments: sides.map(({ side, from, to }, index) => ({ id: `${id}-s${index}`, side, startedAt: from, endedAt: to })),
    portions: portions.map(([at, breastMilkMl, formulaMl], index) => ({
      id: `${id}-p${index}`,
      occurredAt: at,
      breastMilkMl,
      formulaMl,
    })),
    ...audit(Math.min(...times), by),
  }
}

export const diaper = (id: string, at: number, wet: boolean, dirty: boolean, by: string) => ({
  id,
  occurredAt: at,
  wet,
  dirty,
  ...audit(at, by),
})

export const measurement = (id: string, at: number, weightG: number, lengthCm: number, headCm: number, by: string) => ({
  id,
  measuredAt: at,
  weightG,
  lengthCm,
  headCm,
  ...audit(at, by),
})

export const NO_TOTALS = {
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

export interface DayAnswer {
  readonly date: string
  readonly bounds: { readonly start: number; readonly end: number }
  readonly asOf: number
  readonly totals: typeof NO_TOTALS
  readonly feeds: ReadonlyArray<ReturnType<typeof feed>>
  readonly diapers: ReadonlyArray<ReturnType<typeof diaper>>
  readonly sleeps: ReadonlyArray<never>
  readonly measurements: ReadonlyArray<ReturnType<typeof measurement>>
  readonly doses: ReadonlyArray<never>
}

export const emptyDay = (date: string, hours = 24, offset = "-07:00"): DayAnswer => {
  const start = local("00:00", date, offset)
  return {
    date,
    bounds: { start, end: start + hours * HOUR },
    asOf: NOW,
    totals: NO_TOTALS,
    feeds: [],
    diapers: [],
    sleeps: [],
    measurements: [],
    doses: [],
  }
}

export const busyDay = (andrew: string, emily: string): DayAnswer => ({
  ...emptyDay(DAY),
  feeds: [
    feed("from-yesterday", andrew, [{ side: "left", from: local("23:40", "2026-10-08"), to: local("00:15") }]),
    feed("nursed", andrew, [
      { side: "left", from: local("01:05"), to: local("01:19") },
      { side: "right", from: local("01:19"), to: local("01:28") },
    ]),
    feed(
      "paused",
      emily,
      [
        { side: "left", from: local("03:00"), to: local("03:10") },
        { side: "right", from: local("03:30"), to: local("03:40") },
      ],
      [[local("03:45"), 60, 0]],
    ),
    feed("bottle", andrew, [], [[local("04:00"), 0, 90]]),
    feed("running", emily, [{ side: "left", from: local("09:10"), to: null }]),
  ],
  diapers: [
    diaper("pee", local("02:10"), true, false, emily),
    diaper("poo", local("02:20"), false, true, andrew),
    diaper("both", local("05:30"), true, true, emily),
  ],
})

export interface Played {
  readonly days: DayAnswer[]
  readonly asked: string[]
}

export const playHistory = async (page: Page, days: ReadonlyArray<DayAnswer>, timeZone = "America/Vancouver") => {
  const me = await (await page.request.get("/api/me")).json()
  const [andrew, emily] = me.household.caregivers
  const household = { ...me.household, timeZone, units: { volume: "ml", weight: "kg", length: "cm" } }
  const child = { ...me.child, birthDate: BIRTH_DATE }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household, child } }))
  const played: Played = { days: [...days], asked: [] }
  await page.route(/\/api\/days\/[^/]+$/u, (route) => {
    const date = new URL(route.request().url()).pathname.split("/").at(-1) ?? ""
    played.asked.push(date)
    const day = played.days.find((answer) => answer.date === date)
    return day === undefined ? route.fulfill({ status: 404, json: { _tag: "NotFound" } }) : route.fulfill({ json: day })
  })
  return { played, andrew: andrew.id, emily: emily.id }
}

export const openHistory = async (page: Page, search = "") => {
  await page.clock.setFixedTime(NOW)
  await page.goto(`/history${search}`)
}

export const dayHeading = (page: Page) => page.getByRole("navigation", { name: "Days" }).getByRole("heading")
