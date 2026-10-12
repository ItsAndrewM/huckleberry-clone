import { describe, expect, it } from "vitest"
import { averageDay, type DatedTotals, dayStatus, hasEntries, type Totals } from "../../src/index.ts"

const NOTHING: Totals = {
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

const TODAY = "2026-10-14"
const BIRTH = "2026-09-01"

const day = (date: string, change: Partial<Totals> = {}): DatedTotals => ({ date, totals: { ...NOTHING, ...change } })

const FED = { feedsStarted: 8, leftSeconds: 3000, rightSeconds: 2400, nursingSeconds: 5400 }
const BOTTLED = { breastMilkMl: 400, formulaMl: 210, bottleMl: 610 }
const CHANGED = { diapers: 8, wetDiapers: 6, dirtyDiapers: 3 }

describe("hasEntries", () => {
  it("is false for a day with nothing logged", () => {
    expect(hasEntries(NOTHING)).toBe(false)
  })

  it.each([
    ["a feed that started that day", { feedsStarted: 1 }],
    ["only nursing carried over from a feed that started the day before", { leftSeconds: 900, nursingSeconds: 900 }],
    ["only a bottle", { breastMilkMl: 0.1, bottleMl: 0.1 }],
    ["only a diaper", { diapers: 1, dirtyDiapers: 1 }],
  ])("is true for a day with %s", (_label, change) => {
    expect(hasEntries({ ...NOTHING, ...change })).toBe(true)
  })
})

describe("dayStatus", () => {
  it.each([
    ["after-today", day("2026-10-15", FED)],
    ["today", day(TODAY)],
    ["today", day(TODAY, FED)],
    ["before-birth", day("2026-08-31")],
    ["no-entries", day("2026-10-13")],
    ["no-entries", day(BIRTH)],
    ["counted", day("2026-10-13", { diapers: 1, wetDiapers: 1 })],
    ["counted", day(BIRTH, FED)],
  ])("calls the day %s", (status, dated) => {
    expect(dayStatus(dated, TODAY, BIRTH)).toBe(status)
  })

  it("calls her birth date today when she was born today", () => {
    expect(dayStatus(day(TODAY), TODAY, TODAY)).toBe("today")
  })
})

describe("averageDay", () => {
  it("is null while no finished day has entries", () => {
    expect(averageDay([], TODAY, BIRTH)).toBeNull()
    expect(averageDay([day("2026-10-12"), day("2026-10-13"), day(TODAY, FED)], TODAY, BIRTH)).toBeNull()
  })

  it("averages only finished days with entries, and says how many", () => {
    const days = [
      day("2026-08-31", FED),
      day("2026-10-11", { ...FED, ...BOTTLED, ...CHANGED }),
      day("2026-10-12"),
      day("2026-10-13", { ...FED, feedsStarted: 7, ...CHANGED }),
      day(TODAY, { ...FED, ...BOTTLED }),
      day("2026-10-15", FED),
    ]
    expect(averageDay(days, TODAY, BIRTH)).toEqual({
      days: 2,
      totals: {
        feedsStarted: 7.5,
        leftSeconds: 3000,
        rightSeconds: 2400,
        nursingSeconds: 5400,
        breastMilkMl: 200,
        formulaMl: 105,
        bottleMl: 305,
        diapers: 8,
        wetDiapers: 6,
        dirtyDiapers: 3,
      },
    })
  })

  it("counts a missing kind on a day with entries as a real zero", () => {
    const days = [day("2026-10-12", { ...FED, ...BOTTLED }), day("2026-10-13", FED)]
    expect(averageDay(days, TODAY, BIRTH)?.totals.bottleMl).toBe(305)
  })
})
