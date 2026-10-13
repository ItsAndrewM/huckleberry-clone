import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { type CalendarBlock, layoutDay, type Side } from "../../src/index.ts"
import { atMinute, block, dayOf, MINUTE, NEXT_BOUNDS, SCALE, side } from "./fixtures.ts"

interface Extent {
  readonly top: number
  readonly height: number
}

const placed = (blocks: ReadonlyArray<CalendarBlock<Side>>, now?: number) => layoutDay(dayOf(blocks, now), SCALE).blocks

const lanesOf = (blocks: ReadonlyArray<CalendarBlock<Side>>) =>
  placed(blocks).map(({ id, lane, lanes }) => [id, lane, lanes])

describe("layoutDay's blocks", () => {
  it("draws a feed from its first side's start to its last side's end, each side a band inside it", () => {
    const [feed] = placed([block("feed", [side("left", 65, 79), side("right", 79, 88)])])
    expect(feed).toEqual({
      id: "feed",
      top: 13,
      height: 5,
      lane: 0,
      lanes: 1,
      running: false,
      startsBefore: false,
      endsAfter: false,
      bands: [
        { kind: "left", top: 0, height: 3 },
        { kind: "right", top: 3, height: 2 },
      ],
    })
  })

  it("leaves a pause between two sides as a gap between their bands", () => {
    const [feed] = placed([block("feed", [side("left", 120, 130), side("right", 150, 160)])])
    expect(feed?.bands).toEqual([
      { kind: "left", top: 0, height: 2 },
      { kind: "right", top: 6, height: 2 },
    ])
  })

  it("keeps a feed's bottle given after its last side inside the block, after the bands", () => {
    const feed = { ...block("feed", [side("left", 120, 140)]), endedAt: atMinute(150) }
    const [placedFeed] = placed([feed])
    expect(placedFeed).toMatchObject({ top: 24, height: 6, bands: [{ kind: "left", top: 0, height: 4 }] })
  })

  it("makes a short feed tall enough to read, its side filling the block rather than leaving a false pause", () => {
    const [feed] = placed([block("feed", [side("left", 180, 185)])])
    expect(feed).toMatchObject({ top: 36, height: 4, bands: [{ kind: "left", top: 0, height: 4 }] })
  })

  it("drops a side too short to show at this scale", () => {
    const [feed] = placed([block("feed", [side("left", 120, 121), side("right", 121, 180)])])
    expect(feed?.bands).toEqual([{ kind: "right", top: 0, height: 12 }])
  })

  it("cuts a feed that crosses midnight into the part on each day", () => {
    const crossing = block("feed", [side("left", 1420, 1445), side("right", 1445, 1465)])
    const today = layoutDay(dayOf([crossing]), SCALE).blocks
    const tomorrow = layoutDay({ ...dayOf([crossing]), date: "2026-10-10", bounds: NEXT_BOUNDS }, SCALE).blocks
    expect(today).toEqual([
      expect.objectContaining({
        top: 284,
        height: 4,
        startsBefore: false,
        endsAfter: true,
        bands: [{ kind: "left", top: 0, height: 4 }],
      }),
    ])
    expect(tomorrow).toEqual([
      expect.objectContaining({
        top: 0,
        height: 5,
        startsBefore: true,
        endsAfter: false,
        bands: [
          { kind: "left", top: 0, height: 1 },
          { kind: "right", top: 1, height: 4 },
        ],
      }),
    ])
  })

  it("runs a feed still going up to now, and marks it running", () => {
    const [feed] = placed([block("feed", [side("left", 900, 930), side("right", 930, null)])], atMinute(950))
    expect(feed).toMatchObject({ top: 180, height: 10, running: true, endsAfter: false })
    expect(feed?.bands).toEqual([
      { kind: "left", top: 0, height: 6 },
      { kind: "right", top: 6, height: 4 },
    ])
  })

  it("draws a feed that started this moment, its side filling the block", () => {
    const [feed] = placed([block("feed", [side("left", 960, null)])], atMinute(960))
    expect(feed).toMatchObject({ top: 192, height: 4, running: true, bands: [{ kind: "left", top: 0, height: 4 }] })
  })

  it("carries yesterday's feed, still running, through to the end of the day", () => {
    const running = block("feed", [side("left", -30, null)])
    const [feed] = placed([running], NEXT_BOUNDS.start + 10 * MINUTE)
    expect(feed).toMatchObject({ top: 0, height: 288, running: true, startsBefore: true, endsAfter: true })
  })

  it("leaves out a feed that ended as the day began, and one that starts as it ends", () => {
    const before = block("before", [side("left", -20, 0)])
    const after = block("after", [side("left", 1440, null)])
    expect(placed([before, after], NEXT_BOUNDS.start)).toEqual([])
  })

  it("keeps a short block near midnight inside the grid", () => {
    const [feed] = placed([block("feed", [side("left", 1437, 1439)])])
    expect(feed).toMatchObject({ top: 284, height: 4 })
  })

  it("puts overlapping blocks side by side, freeing a lane once its block ends", () => {
    const blocks = [
      block("a", [side("left", 60, 120)]),
      block("b", [side("left", 90, 150)]),
      block("c", [side("left", 120, 180)]),
      block("d", [side("left", 240, 270)]),
    ]
    expect(lanesOf(blocks)).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 2],
      ["d", 0, 1],
    ])
  })

  it("starts a new group of lanes with a block that begins exactly where the overlapping ones end", () => {
    const blocks = [
      block("a", [side("left", 60, 120)]),
      block("b", [side("left", 60, 120)]),
      block("c", [side("left", 120, 180)]),
    ]
    expect(lanesOf(blocks)).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ])
  })

  it("orders blocks that start together by end, then by id", () => {
    const blocks = [
      block("long", [side("left", 300, 360)]),
      block("short", [side("left", 300, 330)]),
      block("twin-b", [side("left", 420, 450)]),
      block("twin-a", [side("left", 420, 450)]),
    ]
    expect(lanesOf(blocks)).toEqual([
      ["short", 0, 2],
      ["long", 1, 2],
      ["twin-a", 0, 2],
      ["twin-b", 1, 2],
    ])
  })

  it("orders twins by id whichever order they arrive in", () => {
    const twins = [block("twin-a", [side("left", 420, 450)]), block("twin-b", [side("left", 420, 450)])]
    expect(lanesOf(twins).map(([id]) => id)).toEqual(["twin-a", "twin-b"])
    expect(lanesOf(twins.toReversed()).map(([id]) => id)).toEqual(["twin-a", "twin-b"])
  })

  it("never puts two blocks that overlap on screen in one lane", () => {
    const spans = fc.array(
      fc
        .tuple(fc.integer({ min: -120, max: 1500 }), fc.integer({ min: 0, max: 300 }))
        .map(([from, length]) => [from, from + length]),
      { maxLength: 12 },
    )
    fc.assert(
      fc.property(spans, (pairs) => {
        const blocks = pairs.map(([from = 0, to = 0], index) => block(`b${index}`, [side("left", from, to)]))
        const shown = placed(blocks)
        const apart = (a: Extent, b: Extent) => a.top + a.height <= b.top || b.top + b.height <= a.top
        const clashes = shown.flatMap((a) =>
          shown.filter((b) => a.id !== b.id && a.lane === b.lane && !apart(a, b)).map((b) => [a.id, b.id]),
        )
        expect(clashes).toEqual([])
        expect(shown.every(({ lane, lanes }) => lane < lanes)).toBe(true)
        expect(shown.every(({ top, height }) => top >= 0 && top + height <= 288)).toBe(true)
      }),
    )
  })
})
