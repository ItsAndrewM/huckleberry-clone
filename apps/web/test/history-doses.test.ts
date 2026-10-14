import type { WeekPeriod } from "@bt/contracts"
import { isoWeekDates, zonedDayBounds } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { dayModel, entriesIn } from "../src/features/history/day-model.ts"
import { markersOf } from "../src/features/history/grid-markers.ts"
import { hiddenExcept, hiddenIn, hiddenNotice, hideOf } from "../src/features/history/history-kinds.ts"
import { supplementChoices } from "../src/features/history/log-at-supplements.ts"
import { weekModel } from "../src/features/history/week-model.ts"
import { columnName } from "../src/features/history/week-names.ts"
import { DATE, DISPLAY, dayWith, LOCALE, local, NOW_ON_DAY } from "./history-fixtures.ts"
import { dosedAt, NO_TOTALS, supplementOf, VITAMIN_D, ZONE } from "./today-fixtures.ts"

const MORNING = dosedAt(local("08:00"), { id: "dose-morning" })
const EVENING = dosedAt(local("20:00"), { id: "dose-evening" })
const SHOWN = { ...DISPLAY, supplements: [supplementOf()] }
const DOSED_DAY = dayWith({ feeds: [], diapers: [], measurements: [], doses: [MORNING] })

const WEEK = "2026-W41"

const weekOf = (doses = [MORNING]): WeekPeriod => {
  const days = isoWeekDates(WEEK).map((date) => ({ date, bounds: zonedDayBounds(date, ZONE), totals: NO_TOTALS }))
  return {
    week: WEEK,
    bounds: { start: days[0]?.bounds.start ?? 0, end: days.at(-1)?.bounds.end ?? 0 },
    asOf: NOW_ON_DAY,
    totals: NO_TOTALS,
    days,
    feeds: [],
    diapers: [],
    sleeps: [],
    measurements: [],
    doses,
  }
}

const CONTEXT = { zone: ZONE, now: NOW_ON_DAY, today: DATE, birthDate: "2026-09-01", hidden: hiddenIn(undefined) }

const columnOn = (week: WeekPeriod, context = CONTEXT) => {
  const column = weekModel(week, context).find(({ date }) => date === DATE)
  if (column === undefined) throw new Error(`expected a column for ${DATE}`)
  return column
}

describe("the Supplements chip", () => {
  it("joins History's filters after Growth, read from and written to the address", () => {
    expect([...hiddenIn("supplements,diapers")]).toEqual(["supplements", "diapers"])
    expect(hideOf(new Set(["supplements", "feeds"]))).toBe("feeds,supplements")
    expect([...hiddenExcept(["feeds", "diapers", "growth"])]).toEqual(["supplements"])
    expect(hiddenNotice(hiddenIn("supplements"))).toBe("Supplements hidden")
  })
})

describe("a dose on the Day view", () => {
  it("is a marker at its time, named by its supplement, that opens its details", () => {
    const model = dayModel(DOSED_DAY, ZONE, NOW_ON_DAY)
    const [marker] = markersOf(model, SHOWN, NOW_ON_DAY)
    expect(marker).toMatchObject({ ids: [MORNING.id], kind: "dose", text: "Vitamin D" })
    expect(marker?.name).toMatch(/^Vitamin D at 8:00\sAM: 400 IU$/u)
    expect(entriesIn(model, [MORNING.id])).toEqual([{ kind: "dose", dose: MORNING }])
  })

  it("leaves the grid when Supplements is off, and is still found by id", () => {
    const model = dayModel(DOSED_DAY, ZONE, NOW_ON_DAY, hiddenIn("supplements"))
    expect(model.grid.clusters).toEqual([])
    expect(entriesIn(model, [MORNING.id])).toHaveLength(1)
  })
})

describe("the Log-at menu's supplements", () => {
  it("offers each supplement in use by name, in the household's order, leaving out a stopped one", () => {
    const iron = supplementOf({ id: "supplement-iron", name: "Iron" })
    const stopped = supplementOf({ id: "supplement-probiotic", name: "Probiotic", stoppedAt: NOW_ON_DAY })
    expect(supplementChoices([supplementOf(), stopped, iron])).toEqual([
      { id: VITAMIN_D, label: "Vitamin D" },
      { id: "supplement-iron", label: "Iron" },
    ])
  })
})

describe("a dose on the Week view", () => {
  it("is a dot in a lane of its own, at its time on the household's clock", () => {
    const column = columnOn(weekOf([MORNING, EVENING]))
    expect(column.doses.map(({ ids }) => ids)).toEqual([[MORNING.id], [EVENING.id]])
    expect(column.grid.clusters).toEqual([])
    expect(column.diapers).toEqual([])
  })

  it("names how many doses a day holds, and leaves them out when Supplements is off", () => {
    expect(columnName(columnOn(weekOf()), "ml", CONTEXT.hidden, LOCALE)).toBe("Fri, Oct 9: a dose")
    expect(columnName(columnOn(weekOf([MORNING, EVENING])), "ml", CONTEXT.hidden, LOCALE)).toBe("Fri, Oct 9: 2 doses")
    const hidden = hiddenIn("supplements")
    const column = columnOn(weekOf(), { ...CONTEXT, hidden })
    expect(column.doses).toEqual([])
    expect(columnName(column, "ml", hidden, LOCALE)).toBe("Fri, Oct 9: nothing shown")
  })
})
