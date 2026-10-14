import type { Page } from "@playwright/test"
import { type DayAnswer, emptyDay, NO_TOTALS, NOW } from "./played-day.ts"

export const THIS_WEEK = "2026-W41"
export const LAST_WEEK = "2026-W40"
const DAY_MS = 86_400_000

const MONDAYS = new Map([
  ["2026-W38", "2026-09-14"],
  ["2026-W40", "2026-09-28"],
  ["2026-W41", "2026-10-05"],
])

const datesFrom = (monday: string) =>
  Array.from({ length: 7 }, (_, day) =>
    new Date(Date.parse(`${monday}T12:00:00Z`) + day * DAY_MS).toISOString().slice(0, 10),
  )

const byId = <Item extends { readonly id: string }>(items: ReadonlyArray<Item>) => [
  ...new Map(items.map((item) => [item.id, item])).values(),
]

export const weekOf = (week: string, days: ReadonlyArray<DayAnswer>) => {
  const answers = datesFrom(MONDAYS.get(week) ?? "").map(
    (date) => days.find((day) => day.date === date) ?? emptyDay(date),
  )
  return {
    week,
    bounds: { start: answers[0]?.bounds.start ?? 0, end: answers.at(-1)?.bounds.end ?? 0 },
    asOf: NOW,
    totals: NO_TOTALS,
    days: answers.map(({ date, bounds, totals }) => ({ date, bounds, totals })),
    feeds: byId(answers.flatMap(({ feeds }) => feeds)),
    diapers: byId(answers.flatMap(({ diapers }) => diapers)),
    sleeps: [],
    measurements: byId(answers.flatMap(({ measurements }) => measurements)),
    doses: byId(answers.flatMap(({ doses }) => doses)),
  }
}

export type WeekAnswer = ReturnType<typeof weekOf>

export const playWeeks = async (page: Page, weeks: Readonly<Record<string, WeekAnswer>>) => {
  const asked: string[] = []
  await page.route(/\/api\/weeks\/[^/]+$/u, (route) => {
    const week = new URL(route.request().url()).pathname.split("/").at(-1) ?? ""
    asked.push(week)
    const answer = weeks[week]
    return answer === undefined
      ? route.fulfill({ status: 404, json: { _tag: "NotFound" } })
      : route.fulfill({ json: answer })
  })
  return asked
}

export const weekGrid = (page: Page) => page.getByRole("region", { name: "The week by hour" })

export const weekHeading = (page: Page) => page.getByRole("navigation", { name: "Weeks" }).getByRole("heading")
