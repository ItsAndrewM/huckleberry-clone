import type { Page } from "@playwright/test"
import { BIRTH_DATE, busyDay, DAY, diaper, dose, emptyDay, feed, local, measurement, NOW, sleep } from "./played-day.ts"
import { datesFrom, periodOf, TRENDS_DAYS } from "./played-period.ts"
import { THIS_WEEK, weekOf } from "./played-week.ts"

const MINUTE = 60_000

const deletedAt = <Entry extends object>(entry: Entry) => ({ ...entry, deletedAt: NOW - 30 * MINUTE })

const dayOf = (andrew: string, emily: string, vitaminD: string) => {
  const busy = busyDay(andrew, emily)
  return {
    ...busy,
    sleeps: [
      sleep("night", local("20:10", "2026-10-08"), local("06:05"), "night", emily),
      sleep("nap", local("07:00"), local("07:20"), "nap", andrew),
    ],
    doses: [dose("dose", vitaminD, local("08:00"), andrew)],
    measurements: [measurement("weighed", local("08:30"), 4300, 54.5, 36.8, emily)],
  }
}

type Day = ReturnType<typeof dayOf>

const todayOf = (day: Day) => {
  const running = day.feeds.find((one) => one.status === "active") ?? null
  const recent = [
    ...day.feeds.map((one) => ({ kind: "feed", feed: one, at: one.startedAt })),
    ...day.diapers.map((one) => ({ kind: "diaper", diaper: one, at: one.occurredAt })),
    ...day.sleeps.map((one) => ({ kind: "sleep", sleep: one, at: one.startedAt })),
    ...day.doses.map((one) => ({ kind: "dose", dose: one, at: one.occurredAt })),
  ]
  return {
    date: DAY,
    totals: TRENDS_DAYS[DAY],
    activeFeed: running,
    lastFeed: running,
    activeSleep: null,
    lastSleep: day.sleeps.at(-1) ?? null,
    prefill: { lastBottle: { breastMilkMl: 60, formulaMl: 0 }, lastSide: "left" },
    recent: recent.toSorted((a, b) => b.at - a.at).map(({ at: _at, ...entry }) => entry),
    doses: day.doses,
  }
}

const deletedOf = (andrew: string, vitaminD: string) => ({
  feeds: [deletedAt(feed("deleted-bottle", andrew, [], [[local("06:40"), 0, 60]]))],
  diapers: [deletedAt(diaper("deleted-diaper", local("06:50"), true, false, andrew))],
  sleeps: [deletedAt(sleep("deleted-nap", local("05:00"), local("05:30"), "nap", andrew))],
  measurements: [],
  doses: [deletedAt(dose("deleted-dose", vitaminD, local("06:55"), andrew))],
})

const growthOf = (andrew: string) => [
  measurement("m3", local("10:00", "2026-10-06"), 4300, 54.5, 36.8, andrew),
  measurement("m1", local("10:00", "2026-09-01"), 3200, 49.5, 34, andrew),
]

const answering = (page: Page, pattern: RegExp, answers: ReadonlyMap<string, object>) =>
  page.route(pattern, (route) => {
    const key = new URL(route.request().url()).pathname.split("/").at(-1) ?? ""
    const answer = answers.get(key)
    return answer === undefined
      ? route.fulfill({ status: 404, json: { _tag: "NotFound" } })
      : route.fulfill({ json: answer })
  })

export const playEveryScreen = async (page: Page) => {
  const me = await (await page.request.get("/api/me")).json()
  const [andrew, emily] = me.household.caregivers
  const vitaminD = me.household.supplements[0].id
  const household = {
    ...me.household,
    timeZone: "America/Vancouver",
    units: { volume: "ml", weight: "kg", length: "cm" },
  }
  const day = dayOf(andrew.id, emily.id, vitaminD)
  const trendsWeek = periodOf(datesFrom("2026-10-05", 7), TRENDS_DAYS)
  const week = { ...weekOf(THIS_WEEK, [day]), days: trendsWeek.days, totals: trendsWeek.totals }
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { ...me, household, child: { ...me.child, birthDate: BIRTH_DATE } } }),
  )
  await page.route("**/api/today", (route) => route.fulfill({ json: todayOf(day) }))
  await page.route("**/api/last24h", (route) =>
    route.fulfill({ json: { from: NOW - 24 * 60 * MINUTE, totals: TRENDS_DAYS[DAY] } }),
  )
  await answering(
    page,
    /\/api\/days\/[^/]+$/u,
    new Map([
      [DAY, day],
      ["2026-10-08", emptyDay("2026-10-08")],
    ]),
  )
  await answering(page, /\/api\/weeks\/[^/]+$/u, new Map([[THIS_WEEK, { ...week, week: THIS_WEEK }]]))
  await answering(
    page,
    /\/api\/months\/[^/]+$/u,
    new Map([["2026-10", { ...periodOf(datesFrom("2026-10-01", 31), TRENDS_DAYS), month: "2026-10" }]]),
  )
  await page.route("**/api/growth", (route) => route.fulfill({ json: { measurements: growthOf(andrew.id) } }))
  await page.route("**/api/deleted", (route) => route.fulfill({ json: deletedOf(andrew.id, vitaminD) }))
  await page.clock.setFixedTime(NOW)
}
