import { describe, expect, it } from "vitest"
import { anchorOf, dayModel, entriesIn, isLiveFeed } from "../src/features/history/day-model.ts"
import { BOTH, BOTTLE, BOUNDS, dayWith, NOW_ON_DAY, NURSED, PAUSED, PEE, POO, RUNNING } from "./history-fixtures.ts"
import { ZONE } from "./today-fixtures.ts"

const LATER_DAY = BOUNDS.end + 3_600_000

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

  it("finds each entry by id, skipping ids it no longer has", () => {
    expect(entriesIn(model, [PEE.id, "gone", NURSED.id])).toEqual([
      { kind: "diaper", diaper: PEE },
      { kind: "feed", feed: NURSED },
    ])
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
