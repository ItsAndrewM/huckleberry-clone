import type { Feed } from "@bt/contracts"
import { zonedDayBounds } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { anchorOf, dayModel, editSheetOf, entriesIn, runningSheetOf } from "../src/features/history/day-model.ts"
import { markersOf } from "../src/features/history/grid-markers.ts"
import { hiddenIn } from "../src/features/history/history-kinds.ts"
import {
  BOTH,
  BOTTLE,
  BOUNDS,
  DISPLAY,
  dayWith,
  local,
  NOW_ON_DAY,
  NURSED,
  PAUSED,
  PEE,
  POO,
  RUNNING,
} from "./history-fixtures.ts"
import { diaperAt, feedAt, sleptAt, ZONE } from "./today-fixtures.ts"

const LATER_DAY = BOUNDS.end + 3_600_000
const DAY_BEFORE = "2026-10-08"

const BOTTLE_AT_MIDNIGHT: Feed = {
  ...feedAt(local("23:30", DAY_BEFORE)),
  endedAt: BOUNDS.start,
  segments: [
    { id: "late-0", side: "left", startedAt: local("23:30", DAY_BEFORE), endedAt: local("23:45", DAY_BEFORE) },
    { id: "late-1", side: "right", startedAt: local("23:45", DAY_BEFORE), endedAt: BOUNDS.start },
  ],
  portions: [{ id: "late-p0", occurredAt: BOUNDS.start, breastMilkMl: 60, formulaMl: 0 }],
}

const PAUSED_AT_MIDNIGHT: Feed = { ...BOTTLE_AT_MIDNIGHT, status: "active", endedAt: null }
const DIAPER_AFTER_MIDNIGHT = diaperAt(local("00:10"))

describe("dayModel", () => {
  const model = dayModel(dayWith(), ZONE, NOW_ON_DAY)

  it("draws each nursing feed as a block from its first side to its last, with a band per side", () => {
    expect(model.grid.blocks.map(({ id }) => id)).toEqual([NURSED.id, PAUSED.id, RUNNING.id])
    expect(model.grid.blocks[1]).toMatchObject({
      top: 36,
      height: 9,
      bands: [
        { kind: "left", top: 0, height: 2 },
        { kind: "right", top: 6, height: 2 },
      ],
    })
  })

  it("draws a bottle on its own and each diaper as a marker, gathering those close together", () => {
    expect(model.grid.clusters).toEqual([
      { top: 26, ids: [PEE.id, POO.id] },
      { top: 48, ids: [BOTTLE.id] },
      { top: 66, ids: [BOTH.id] },
    ])
  })

  it("draws a nursing feed whose bottle lands as the day begins as that bottle, at the top, opening the feed", () => {
    const next = dayModel(dayWith({ feeds: [BOTTLE_AT_MIDNIGHT], diapers: [] }), ZONE, NOW_ON_DAY)
    expect(next.grid.blocks).toEqual([])
    expect(next.grid.clusters).toEqual([{ top: 0, ids: [BOTTLE_AT_MIDNIGHT.id] }])
    expect(markersOf(next, DISPLAY, NOW_ON_DAY)).toEqual([
      expect.objectContaining({
        kind: "bottle",
        text: "60 mL",
        name: "Nursing and bottle at 11:30 PM: Left 15 min, Right 15 min, 60 mL",
      }),
    ])
    expect(entriesIn(next, [BOTTLE_AT_MIDNIGHT.id])).toEqual([{ kind: "feed", feed: BOTTLE_AT_MIDNIGHT }])
  })

  it("keeps that feed a block on the day it nursed, ending at the bottom of the grid", () => {
    const bounds = zonedDayBounds(DAY_BEFORE, ZONE)
    const before = dayModel(
      dayWith({ date: DAY_BEFORE, bounds, feeds: [BOTTLE_AT_MIDNIGHT], diapers: [] }),
      ZONE,
      NOW_ON_DAY,
    )
    expect(before.grid.blocks).toEqual([
      expect.objectContaining({ id: BOTTLE_AT_MIDNIGHT.id, top: 282, height: 6, endsAfter: false }),
    ])
    expect(before.grid.clusters).toEqual([])
  })

  it("finds each entry by id, skipping ids it no longer has", () => {
    expect(entriesIn(model, [PEE.id, "gone", NURSED.id])).toEqual([
      { kind: "diaper", diaper: PEE },
      { kind: "feed", feed: NURSED },
    ])
  })

  it("leaves out the kinds a filter hides, and still finds every entry", () => {
    const noDiapers = dayModel(dayWith(), ZONE, NOW_ON_DAY, hiddenIn("diapers"))
    expect(noDiapers.grid.blocks.map(({ id }) => id)).toEqual([NURSED.id, PAUSED.id, RUNNING.id])
    expect(noDiapers.grid.clusters).toEqual([{ top: 48, ids: [BOTTLE.id] }])
    const noFeeds = dayModel(dayWith(), ZONE, NOW_ON_DAY, hiddenIn("feeds"))
    expect(noFeeds.grid.blocks).toEqual([])
    expect(noFeeds.grid.clusters.flatMap(({ ids }) => ids)).toEqual([PEE.id, POO.id, BOTH.id])
    expect(entriesIn(noFeeds, [NURSED.id, PEE.id])).toHaveLength(2)
  })
})

describe("runningSheetOf", () => {
  const model = dayModel(dayWith(), ZONE, NOW_ON_DAY)

  it("is Nursing for a running or paused feed tapped on its own, and Sleep for a running sleep", () => {
    const paused = { id: "paused-now", side: "left" as const, startedAt: RUNNING.startedAt, endedAt: NOW_ON_DAY }
    expect(runningSheetOf(entriesIn(model, [RUNNING.id]))).toBe("nursing")
    expect(runningSheetOf([{ kind: "feed", feed: { ...RUNNING, segments: [paused] } }])).toBe("nursing")
    expect(runningSheetOf([{ kind: "sleep", sleep: sleptAt(local("08:48"), { endedAt: null }) }])).toBe("sleep")
  })

  it("isn't for a finished feed or sleep, a diaper, or several entries", () => {
    expect(runningSheetOf(entriesIn(model, [NURSED.id]))).toBeNull()
    expect(runningSheetOf(entriesIn(model, [PEE.id]))).toBeNull()
    expect(runningSheetOf([{ kind: "sleep", sleep: sleptAt(local("01:10")) }])).toBeNull()
    expect(runningSheetOf(entriesIn(model, [RUNNING.id, PEE.id]))).toBeNull()
    expect(runningSheetOf([])).toBeNull()
  })
})

describe("editSheetOf", () => {
  it("opens a diaper's own sheet, a finished feed's, and Nursing for a feed that's running or paused", () => {
    expect(editSheetOf({ kind: "diaper", diaper: PEE })).toBe("editDiaper")
    expect(editSheetOf({ kind: "feed", feed: NURSED })).toBe("editFeed")
    expect(editSheetOf({ kind: "feed", feed: RUNNING })).toBe("nursing")
    expect(editSheetOf({ kind: "feed", feed: PAUSED_AT_MIDNIGHT })).toBe("nursing")
  })

  it("opens a finished sleep's edit sheet, and Sleep for one still running", () => {
    expect(editSheetOf({ kind: "sleep", sleep: sleptAt(local("01:10")) })).toBe("editSleep")
    expect(editSheetOf({ kind: "sleep", sleep: sleptAt(local("08:48"), { endedAt: null }) })).toBe("sleep")
  })

  it("opens Nursing for a paused feed pinned to the top of the day and gathered with a diaper, where runningSheetOf no longer sees it", () => {
    const model = dayModel(dayWith({ feeds: [PAUSED_AT_MIDNIGHT], diapers: [DIAPER_AFTER_MIDNIGHT] }), ZONE, NOW_ON_DAY)
    const ids = [PAUSED_AT_MIDNIGHT.id, DIAPER_AFTER_MIDNIGHT.id]
    expect(markersOf(model, DISPLAY, NOW_ON_DAY)).toEqual([expect.objectContaining({ kind: "several", ids })])
    const entries = entriesIn(model, ids)
    expect(runningSheetOf(entries)).toBeNull()
    expect(entries.map((entry) => editSheetOf(entry))).toEqual(["nursing", "editDiaper"])
  })
})

describe("anchorOf", () => {
  it("is now on today, the first entry on another day, and the top on an empty one", () => {
    expect(anchorOf(dayModel(dayWith(), ZONE, NOW_ON_DAY))).toBe(114)
    expect(anchorOf(dayModel(dayWith(), ZONE, LATER_DAY))).toBe(13)
    expect(anchorOf(dayModel(dayWith({ feeds: [], diapers: [] }), ZONE, LATER_DAY))).toBe(0)
  })
})

describe("a day's sleeps", () => {
  const NIGHT = sleptAt(local("20:30", DAY_BEFORE), { id: "night", kind: "night", endedAt: local("05:00") })
  const NAP = sleptAt(local("07:10"), { id: "nap", endedAt: local("08:20") })
  const model = dayModel(dayWith({ sleeps: [NIGHT, NAP] }), ZONE, NOW_ON_DAY)

  it("draws each sleep in a column of its own, cut where the day begins, leaving the feeds' lanes alone", () => {
    expect(model.sleeps).toEqual([
      expect.objectContaining({ id: "night", top: 0, height: 60, startsBefore: true, lane: 0, lanes: 1, bands: [] }),
      expect.objectContaining({ id: "nap", top: 86, height: 14, startsBefore: false, lanes: 1 }),
    ])
    expect(model.grid.blocks.map(({ lanes }) => lanes)).toEqual([1, 1, 1])
    expect(entriesIn(model, ["nap"])).toEqual([{ kind: "sleep", sleep: NAP }])
  })

  it("draws a running sleep down to now", () => {
    const running = sleptAt(local("08:50"), { id: "running", endedAt: null })
    expect(dayModel(dayWith({ sleeps: [running] }), ZONE, NOW_ON_DAY).sleeps).toEqual([
      expect.objectContaining({ id: "running", top: 106, height: 8, running: true }),
    ])
  })

  it("hides sleeps behind the Sleep chip, and still finds them", () => {
    const hidden = dayModel(dayWith({ sleeps: [NIGHT, NAP] }), ZONE, NOW_ON_DAY, hiddenIn("sleep"))
    expect(hidden.sleeps).toEqual([])
    expect(entriesIn(hidden, ["night"])).toHaveLength(1)
  })

  it("opens a day with only a sleep at that sleep", () => {
    expect(anchorOf(dayModel(dayWith({ feeds: [], diapers: [], sleeps: [NAP] }), ZONE, LATER_DAY))).toBe(86)
  })
})
