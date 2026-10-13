import type { Feed, WeekPeriod } from "@bt/contracts"
import { isoWeekDates, zonedDayBounds } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { hiddenIn } from "../src/features/history/history-kinds.ts"
import { type WeekContext, weekModel } from "../src/features/history/week-model.ts"
import { columnName, shownTotals } from "../src/features/history/week-names.ts"
import {
  BOTH,
  BOTTLE,
  DATE,
  local,
  LOCALE,
  NOW_ON_DAY,
  NURSED,
  PAUSED,
  PEE,
  POO,
  RUNNING,
  WEIGHED,
} from "./history-fixtures.ts"
import { feedAt, NO_TOTALS, ZONE } from "./today-fixtures.ts"

const WEEK = "2026-W41"
const THURSDAY = "2026-10-08"

const ACROSS_MIDNIGHT: Feed = {
  ...feedAt(local("23:40", THURSDAY)),
  endedAt: local("00:15"),
  segments: [{ id: "across-0", side: "left", startedAt: local("23:40", THURSDAY), endedAt: local("00:15") }],
}

const FRIDAY_TOTALS = { ...NO_TOTALS, feedsStarted: 4, nursingSeconds: 3480, bottleMl: 150, diapers: 3, wetDiapers: 2 }

const weekWith = (change: Partial<WeekPeriod> = {}): WeekPeriod => {
  const days = isoWeekDates(WEEK).map((date) => ({
    date,
    bounds: zonedDayBounds(date, ZONE),
    totals: date === DATE ? FRIDAY_TOTALS : NO_TOTALS,
  }))
  return {
    week: WEEK,
    bounds: { start: days[0]?.bounds.start ?? 0, end: days.at(-1)?.bounds.end ?? 0 },
    asOf: NOW_ON_DAY,
    totals: FRIDAY_TOTALS,
    days,
    feeds: [ACROSS_MIDNIGHT, NURSED, PAUSED, BOTTLE, RUNNING],
    diapers: [PEE, POO, BOTH],
    measurements: [WEIGHED],
    ...change,
  }
}

const CONTEXT: WeekContext = {
  zone: ZONE,
  now: NOW_ON_DAY,
  today: DATE,
  birthDate: "2026-09-01",
  hidden: hiddenIn(undefined),
}

const columnOn = (date: string, context: WeekContext = CONTEXT) => {
  const column = weekModel(weekWith(), context).find((each) => each.date === date)
  if (column === undefined) throw new Error(`No column for ${date}`)
  return column
}

describe("weekModel", () => {
  it("gives the week's seven days, Monday first, opening each one up to today", () => {
    const columns = weekModel(weekWith(), CONTEXT)
    expect(columns.map(({ date }) => date)).toEqual(isoWeekDates(WEEK))
    expect(columns.map(({ opens }) => opens)).toEqual([true, true, true, true, true, false, false])
    expect(columns.filter(({ isToday }) => isToday).map(({ date }) => date)).toEqual([DATE])
  })

  it("draws each nursing feed as a bar, at ten-minute steps on the household's clock", () => {
    const { grid } = columnOn(DATE)
    expect(grid.steps).toBe(144)
    expect(grid.blocks.map(({ id }) => id)).toEqual([ACROSS_MIDNIGHT.id, NURSED.id, PAUSED.id, RUNNING.id])
    expect(grid.blocks[1]).toMatchObject({ top: 7, height: 2, lane: 0, lanes: 1 })
    expect(grid.blocks[2]?.bands.map(({ kind }) => kind)).toEqual(["left", "right"])
  })

  it("puts bottles and diapers in their own dots, gathering only those of a kind", () => {
    const column = columnOn(DATE)
    expect(column.grid.clusters).toEqual([{ top: 24, ids: [BOTTLE.id] }])
    expect(column.diapers).toEqual([
      { top: 13, ids: [PEE.id, POO.id] },
      { top: 33, ids: [BOTH.id] },
    ])
  })

  it("draws a feed across midnight in both days, and today's now line on today alone", () => {
    expect(columnOn(THURSDAY).grid.blocks).toEqual([
      expect.objectContaining({ id: ACROSS_MIDNIGHT.id, top: 142, height: 2, endsAfter: true }),
    ])
    expect(columnOn(DATE).grid.blocks[0]).toMatchObject({ top: 0, startsBefore: true })
    expect(columnOn(DATE).grid.now).toBe(57)
    expect(columnOn(THURSDAY).grid.now).toBeNull()
  })

  it("marks a day with a measurement", () => {
    expect(columnOn(DATE).measured).toBe(true)
    expect(columnOn(THURSDAY).measured).toBe(false)
  })

  it("leaves out what the filters hide", () => {
    const noFeeds = columnOn(DATE, { ...CONTEXT, hidden: hiddenIn("feeds") })
    expect(noFeeds.grid.blocks).toEqual([])
    expect(noFeeds.grid.clusters).toEqual([])
    expect(noFeeds.diapers).toHaveLength(2)
    expect(columnOn(DATE, { ...CONTEXT, hidden: hiddenIn("diapers") }).diapers).toEqual([])
    expect(columnOn(DATE, { ...CONTEXT, hidden: hiddenIn("growth") }).measured).toBe(false)
  })

  it("opens no day before her birth date", () => {
    const columns = weekModel(weekWith(), { ...CONTEXT, birthDate: "2026-10-07" })
    expect(columns.map(({ opens }) => opens)).toEqual([false, false, true, true, true, false, false])
  })
})

describe("columnName", () => {
  it("names a day by its date and what was logged, or that nothing was", () => {
    expect(columnName(columnOn(DATE), "ml", CONTEXT.hidden, LOCALE)).toBe(
      "Fri, Oct 9: 4 feeds started, 58 min nursing, 150 mL in bottles; 3 diapers, 2 pee; a measurement",
    )
    expect(columnName(columnOn(THURSDAY), "ml", CONTEXT.hidden, LOCALE)).toBe("Thu, Oct 8: nothing logged")
  })

  it("leaves what's hidden out of a day's name", () => {
    const hidden = hiddenIn("feeds,growth")
    expect(columnName(columnOn(DATE, { ...CONTEXT, hidden }), "ml", hidden, LOCALE)).toBe(
      "Fri, Oct 9: 3 diapers, 2 pee",
    )
  })
})

describe("shownTotals", () => {
  it("zeroes the hidden kinds' totals and keeps the rest", () => {
    expect(shownTotals(FRIDAY_TOTALS, hiddenIn("diapers"))).toEqual({ ...FRIDAY_TOTALS, diapers: 0, wetDiapers: 0 })
    expect(shownTotals(FRIDAY_TOTALS, hiddenIn(undefined))).toBe(FRIDAY_TOTALS)
  })
})
