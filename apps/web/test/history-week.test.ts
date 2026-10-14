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
import { diaperAt, feedAt, NO_TOTALS, sleptAt, ZONE } from "./today-fixtures.ts"

const WEEK = "2026-W41"
const MONDAY = "2026-10-05"
const TUESDAY = "2026-10-06"
const THURSDAY = "2026-10-08"

const ACROSS_MIDNIGHT: Feed = {
  ...feedAt(local("23:40", THURSDAY)),
  endedAt: local("00:15"),
  segments: [{ id: "across-0", side: "left", startedAt: local("23:40", THURSDAY), endedAt: local("00:15") }],
}

const FRIDAY_TOTALS = { ...NO_TOTALS, feedsStarted: 4, nursingSeconds: 3480, bottleMl: 150, diapers: 3, wetDiapers: 2 }

const BACK = "2026-W44"
const LOS_ANGELES = "America/Los_Angeles"

const nursedAt = (id: string, at: number): Feed => ({
  ...feedAt(at),
  id,
  endedAt: at + 15 * 60_000,
  segments: [{ id: `${id}-0`, side: "left", startedAt: at, endedAt: at + 15 * 60_000 }],
})

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
    sleeps: [],
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

const columnOn = (date: string, context: WeekContext = CONTEXT, week: WeekPeriod = weekWith()) => {
  const column = weekModel(week, context).find((each) => each.date === date)
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
    expect(grid.blocks[3]).toMatchObject({ id: RUNNING.id, top: 52, height: 5, running: true })
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

  it("draws a nursing feed that ends as the next day begins on its own day alone", () => {
    const week = weekWith({ feeds: [nursedAt("ends-at-midnight", local("23:45", MONDAY))] })
    expect(columnOn(MONDAY, CONTEXT, week).grid.blocks.map(({ id }) => id)).toEqual(["ends-at-midnight"])
    expect(columnOn(TUESDAY, CONTEXT, week).grid.blocks).toEqual([])
    expect(columnOn(TUESDAY, CONTEXT, week).grid.clusters).toEqual([])
  })

  it("keeps a feed whose bottle lands as the next day begins as a dot at that day's top", () => {
    const bottled: Feed = {
      ...nursedAt("bottle-at-midnight", local("23:45", MONDAY)),
      portions: [{ id: "bottle-at-midnight-p0", occurredAt: local("00:00", TUESDAY), breastMilkMl: 60, formulaMl: 0 }],
    }
    const week = weekWith({ feeds: [bottled] })
    expect(columnOn(MONDAY, CONTEXT, week).grid.blocks.map(({ id }) => id)).toEqual([bottled.id])
    expect(columnOn(TUESDAY, CONTEXT, week).grid.clusters).toEqual([{ top: 0, ids: [bottled.id] }])
  })

  it("lays the night the clocks go back on the household's clock, both 1:30 feeds on one row", () => {
    const days = isoWeekDates(BACK).map((date) => ({
      date,
      bounds: zonedDayBounds(date, LOS_ANGELES),
      totals: NO_TOTALS,
    }))
    const week: WeekPeriod = {
      week: BACK,
      bounds: { start: days[0]?.bounds.start ?? 0, end: days.at(-1)?.bounds.end ?? 0 },
      asOf: Date.UTC(2026, 10, 2, 12),
      totals: NO_TOTALS,
      days,
      feeds: [nursedAt("first", Date.UTC(2026, 10, 1, 8, 30)), nursedAt("second", Date.UTC(2026, 10, 1, 9, 30))],
      diapers: [diaperAt(Date.UTC(2026, 10, 1, 8, 30)), diaperAt(Date.UTC(2026, 10, 1, 9, 30), { dirty: true })],
      sleeps: [],
      measurements: [],
    }
    const context = { ...CONTEXT, zone: LOS_ANGELES, now: Date.UTC(2026, 10, 2, 12), today: "2026-11-02" }
    const sunday = weekModel(week, context).find(({ date }) => date === "2026-11-01")
    expect(sunday?.grid.steps).toBe(144)
    expect(sunday?.grid.blocks.map(({ top, lane, lanes }) => [top, lane, lanes])).toEqual([
      [9, 0, 2],
      [9, 1, 2],
    ])
    expect(sunday?.diapers.map(({ top, ids }) => [top, ids.length])).toEqual([[9, 2]])
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

  it("says nothing is shown when a day's entries are all hidden, and nothing logged only when nothing was", () => {
    const all = hiddenIn("feeds,diapers,growth")
    expect(columnName(columnOn(DATE, { ...CONTEXT, hidden: all }), "ml", all, LOCALE)).toBe("Fri, Oct 9: nothing shown")
    expect(columnName(columnOn(THURSDAY, { ...CONTEXT, hidden: all }), "ml", all, LOCALE)).toBe(
      "Thu, Oct 8: nothing logged",
    )
    const growth = hiddenIn("growth")
    const weighed = weekWith({ measurements: [{ ...WEIGHED, measuredAt: local("08:00", THURSDAY) }] })
    expect(columnName(columnOn(THURSDAY, { ...CONTEXT, hidden: growth }, weighed), "ml", growth, LOCALE)).toBe(
      "Thu, Oct 8: nothing shown",
    )
  })
})

describe("shownTotals", () => {
  it("zeroes the hidden kinds' totals and keeps the rest", () => {
    expect(shownTotals(FRIDAY_TOTALS, hiddenIn("diapers"))).toEqual({ ...FRIDAY_TOTALS, diapers: 0, wetDiapers: 0 })
    expect(shownTotals(FRIDAY_TOTALS, hiddenIn(undefined))).toBe(FRIDAY_TOTALS)
  })
})

describe("a week's sleeps", () => {
  const NIGHT = sleptAt(local("19:50", THURSDAY), { id: "night", kind: "night", endedAt: local("06:10") })
  const week = weekWith({ sleeps: [NIGHT] })

  it("draws a night across midnight as a stripe in both days, each at ten-minute steps on the household's clock", () => {
    expect(columnOn(THURSDAY, CONTEXT, week).sleeps).toEqual([
      expect.objectContaining({ id: "night", top: 119, height: 25, endsAfter: true }),
    ])
    expect(columnOn(DATE, CONTEXT, week).sleeps).toEqual([
      expect.objectContaining({ id: "night", top: 0, height: 37, startsBefore: true }),
    ])
  })

  it("leaves the stripe out behind the Sleep chip", () => {
    expect(columnOn(DATE, { ...CONTEXT, hidden: hiddenIn("sleep") }, week).sleeps).toEqual([])
  })

  it("says the day's sleep in a column's name, and nothing of it behind the Sleep chip, naps included", () => {
    const totals = {
      ...NO_TOTALS,
      sleepsStarted: 2,
      sleepSeconds: 25_800,
      napSeconds: 3_000,
      nightSeconds: 22_800,
      longestSleepSeconds: 22_800,
    }
    expect(shownTotals(totals, hiddenIn("sleep"))).toEqual(NO_TOTALS)
    const column = { ...columnOn(DATE, CONTEXT, week), totals }
    expect(columnName(column, "ml", hiddenIn(undefined), LOCALE)).toBe(
      "Fri, Oct 9: 7 h 10 min asleep, 50 min naps, 6 h 20 min night; a measurement",
    )
    expect(columnName(column, "ml", hiddenIn("sleep"), LOCALE)).toBe("Fri, Oct 9: a measurement")
  })
})
