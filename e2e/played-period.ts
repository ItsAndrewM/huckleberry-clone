import type { Page } from "@playwright/test"
import { BIRTH_DATE, NO_TOTALS, NOW } from "./played-day.ts"

export { NOW }

const HOUR = 3_600_000
const DAY_MS = 24 * HOUR

export type Totals = typeof NO_TOTALS

export const logged = (feeds: number, left: number, right: number, milk: number, formula: number, diapers: number) => ({
  ...NO_TOTALS,
  feedsStarted: feeds,
  leftSeconds: left * 60,
  rightSeconds: right * 60,
  nursingSeconds: (left + right) * 60,
  breastMilkMl: milk,
  formulaMl: formula,
  bottleMl: milk + formula,
  diapers,
  wetDiapers: diapers - 2,
  dirtyDiapers: 3,
})

export const TRENDS_DAYS = {
  "2026-10-02": logged(8, 50, 45, 300, 120, 7),
  "2026-10-03": logged(9, 60, 50, 280, 150, 8),
  "2026-10-05": logged(8, 52, 48, 400, 210, 8),
  "2026-10-06": logged(7, 40, 40, 520, 0, 7),
  "2026-10-07": logged(9, 55, 61, 380, 90, 9),
  "2026-10-08": logged(8, 45, 50, 410, 160, 8),
  "2026-10-09": logged(3, 20, 10, 120, 0, 3),
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const datesFrom = (first: string, count: number) =>
  Array.from({ length: count }, (_, index) => isoDate(Date.parse(`${first}T12:00:00Z`) + index * DAY_MS))

const midnight = (date: string) => Date.parse(`${date}T00:00:00-07:00`)

const sum = (all: ReadonlyArray<Totals>): Totals => ({
  feedsStarted: all.reduce((total, totals) => total + totals.feedsStarted, 0),
  leftSeconds: all.reduce((total, totals) => total + totals.leftSeconds, 0),
  rightSeconds: all.reduce((total, totals) => total + totals.rightSeconds, 0),
  nursingSeconds: all.reduce((total, totals) => total + totals.nursingSeconds, 0),
  breastMilkMl: all.reduce((total, totals) => total + totals.breastMilkMl, 0),
  formulaMl: all.reduce((total, totals) => total + totals.formulaMl, 0),
  bottleMl: all.reduce((total, totals) => total + totals.bottleMl, 0),
  diapers: all.reduce((total, totals) => total + totals.diapers, 0),
  wetDiapers: all.reduce((total, totals) => total + totals.wetDiapers, 0),
  dirtyDiapers: all.reduce((total, totals) => total + totals.dirtyDiapers, 0),
  sleepsStarted: all.reduce((total, totals) => total + totals.sleepsStarted, 0),
  sleepSeconds: all.reduce((total, totals) => total + totals.sleepSeconds, 0),
  napSeconds: all.reduce((total, totals) => total + totals.napSeconds, 0),
  nightSeconds: all.reduce((total, totals) => total + totals.nightSeconds, 0),
  longestSleepSeconds: Math.max(0, ...all.map((totals) => totals.longestSleepSeconds)),
})

export const periodOf = (dates: ReadonlyArray<string>, days: Readonly<Record<string, Totals>>) => {
  const answers = dates.map((date) => ({
    date,
    bounds: { start: midnight(date), end: midnight(date) + DAY_MS },
    totals: days[date] ?? NO_TOTALS,
  }))
  return {
    bounds: { start: answers[0]?.bounds.start ?? 0, end: answers.at(-1)?.bounds.end ?? 0 },
    asOf: NOW,
    totals: sum(answers.map(({ totals }) => totals)),
    days: answers,
    feeds: [],
    diapers: [],
    sleeps: [],
    measurements: [],
    doses: [],
  }
}

export type PeriodAnswer = ReturnType<typeof periodOf>

export interface PlayedPeriods {
  readonly weeks: Readonly<Record<string, PeriodAnswer>>
  readonly months: Readonly<Record<string, PeriodAnswer>>
}

const answerPeriods = (page: Page, path: string, name: string, periods: Readonly<Record<string, PeriodAnswer>>) =>
  page.route(new RegExp(`/api/${path}/[^/]+$`, "u"), (route) => {
    const key = new URL(route.request().url()).pathname.split("/").at(-1) ?? ""
    const period = periods[key]
    return period === undefined
      ? route.fulfill({ status: 404, json: { _tag: "NotFound" } })
      : route.fulfill({ json: { ...period, [name]: key } })
  })

export const playTrends = async (page: Page, { weeks, months }: PlayedPeriods, volume: "ml" | "fl_oz" = "ml") => {
  const me = await (await page.request.get("/api/me")).json()
  const household = {
    ...me.household,
    timeZone: "America/Vancouver",
    units: { volume, weight: "kg", length: "cm" },
  }
  const child = { ...me.child, birthDate: BIRTH_DATE }
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...me, household, child } }))
  await answerPeriods(page, "weeks", "week", weeks)
  await answerPeriods(page, "months", "month", months)
}

export const openTrends = async (page: Page, search = "") => {
  await page.clock.setFixedTime(NOW)
  await page.goto(`/trends${search}`)
}
