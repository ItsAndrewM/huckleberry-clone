import type { Feed } from "@bt/contracts"
import { zonedDayBounds } from "@bt/domain"
import { describe, expect, it } from "vitest"
import { anchorOf, dayModel, entriesIn, isLiveFeed } from "../src/features/history/day-model.ts"
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
import { feedAt, ZONE } from "./today-fixtures.ts"

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

describe("isLiveFeed", () => {
  const model = dayModel(dayWith(), ZONE, NOW_ON_DAY)

  it("is a running or paused feed tapped on its own", () => {
    const paused = { id: "paused-now", side: "left" as const, startedAt: RUNNING.startedAt, endedAt: NOW_ON_DAY }
    expect(isLiveFeed(entriesIn(model, [RUNNING.id]))).toBe(true)
    expect(isLiveFeed([{ kind: "feed", feed: { ...RUNNING, segments: [paused] } }])).toBe(true)
  })

  it("isn't a finished feed, a diaper, or several entries", () => {
    expect(isLiveFeed(entriesIn(model, [NURSED.id]))).toBe(false)
    expect(isLiveFeed(entriesIn(model, [PEE.id]))).toBe(false)
    expect(isLiveFeed(entriesIn(model, [RUNNING.id, PEE.id]))).toBe(false)
    expect(isLiveFeed([])).toBe(false)
  })
})

describe("anchorOf", () => {
  it("is now on today, the first entry on another day, and the top on an empty one", () => {
    expect(anchorOf(dayModel(dayWith(), ZONE, NOW_ON_DAY))).toBe(114)
    expect(anchorOf(dayModel(dayWith(), ZONE, LATER_DAY))).toBe(13)
    expect(anchorOf(dayModel(dayWith({ feeds: [], diapers: [] }), ZONE, LATER_DAY))).toBe(0)
  })
})
