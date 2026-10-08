import { describe, expect, it } from "vitest"
import { feedSummary, sessionBounds } from "../../src/index.ts"
import { AC3_MIXED_BOTTLE, AC4_MIDNIGHT_FEED } from "../fixtures/scenarios.ts"

const at = (iso: string) => Date.parse(iso)
const T0 = at("2026-10-06T18:00:00Z")
const MINUTE = 60_000

describe("feedSummary", () => {
  it("totals the AC 4 feed: 15 + 15 minutes and 50 + 50 mL", () => {
    expect(feedSummary(AC4_MIDNIGHT_FEED, at("2026-10-07T08:00:00Z"))).toEqual({
      leftSeconds: 15 * 60,
      rightSeconds: 15 * 60,
      nursingSeconds: 30 * 60,
      breastMilkMl: 50,
      formulaMl: 50,
      bottleMl: 100,
    })
  })

  it("splits a mixed bottle into breast milk and formula (AC 3: 40 + 20 mL)", () => {
    expect(feedSummary({ segments: [], portions: [AC3_MIXED_BOTTLE] }, T0)).toMatchObject({
      breastMilkMl: 40,
      formulaMl: 20,
      bottleMl: 60,
    })
  })

  it("counts the running side up to now", () => {
    const feed = {
      segments: [
        { side: "left", startedAt: T0, endedAt: T0 + 10 * MINUTE },
        { side: "right", startedAt: T0 + 10 * MINUTE, endedAt: null },
      ],
      portions: [],
    } as const
    expect(feedSummary(feed, T0 + 14 * MINUTE)).toMatchObject({
      leftSeconds: 600,
      rightSeconds: 240,
      nursingSeconds: 840,
    })
  })

  it("adds up several segments on the same side", () => {
    const feed = {
      segments: [
        { side: "left", startedAt: T0, endedAt: T0 + 5 * MINUTE },
        { side: "right", startedAt: T0 + 5 * MINUTE, endedAt: T0 + 10 * MINUTE },
        { side: "left", startedAt: T0 + 10 * MINUTE, endedAt: T0 + 13 * MINUTE },
      ],
      portions: [],
    } as const
    expect(feedSummary(feed, T0 + 13 * MINUTE)).toMatchObject({
      leftSeconds: 480,
      rightSeconds: 300,
      nursingSeconds: 780,
    })
  })

  it("makes left + right add up to the total it shows", () => {
    const feed = {
      segments: [
        { side: "left", startedAt: T0, endedAt: T0 + 1600 },
        { side: "right", startedAt: T0 + 1600, endedAt: T0 + 3200 },
      ],
      portions: [],
    } as const
    expect(feedSummary(feed, T0 + 3200)).toMatchObject({ leftSeconds: 1, rightSeconds: 1, nursingSeconds: 2 })
  })

  it("adds decimal volumes without floating-point noise", () => {
    const feed = {
      segments: [],
      portions: [
        { occurredAt: T0, breastMilkMl: 0.1, formulaMl: 40.1 },
        { occurredAt: T0, breastMilkMl: 0.2, formulaMl: 19.9 },
      ],
    }
    expect(feedSummary(feed, T0)).toMatchObject({ breastMilkMl: 0.3, formulaMl: 60, bottleMl: 60.3 })
  })

  it("rounds the summed volume to 0.1 mL, not each portion before summing", () => {
    const feed = {
      segments: [],
      portions: [
        { occurredAt: T0, breastMilkMl: 40.15, formulaMl: 0 },
        { occurredAt: T0, breastMilkMl: 40.15, formulaMl: 0 },
      ],
    }
    expect(feedSummary(feed, T0)).toMatchObject({ breastMilkMl: 80.3, formulaMl: 0, bottleMl: 80.3 })
  })

  it("is all zeros for an empty feed", () => {
    expect(feedSummary({ segments: [], portions: [] }, T0)).toEqual({
      leftSeconds: 0,
      rightSeconds: 0,
      nursingSeconds: 0,
      breastMilkMl: 0,
      formulaMl: 0,
      bottleMl: 0,
    })
  })
})

describe("sessionBounds", () => {
  it("runs from the first component to the last (AC 4 feed)", () => {
    expect(sessionBounds(AC4_MIDNIGHT_FEED)).toEqual({
      startedAt: at("2026-10-07T06:50:00Z"),
      endedAt: at("2026-10-07T07:25:00Z"),
    })
  })

  it("has no end while a segment is running", () => {
    const feed = { segments: [{ side: "left", startedAt: T0, endedAt: null }], portions: [] } as const
    expect(sessionBounds(feed)).toEqual({ startedAt: T0, endedAt: null })
  })

  it("has no end while a segment runs, even beside closed segments and an earlier bottle", () => {
    const feed = {
      segments: [
        { side: "left", startedAt: T0, endedAt: T0 + 10 * MINUTE },
        { side: "right", startedAt: T0 + 10 * MINUTE, endedAt: null },
      ],
      portions: [{ occurredAt: T0 - 5 * MINUTE, breastMilkMl: 30, formulaMl: 0 }],
    } as const
    expect(sessionBounds(feed)).toEqual({ startedAt: T0 - 5 * MINUTE, endedAt: null })
  })

  it("starts and ends at the bottle for a bottle-only feed", () => {
    expect(sessionBounds({ segments: [], portions: [AC3_MIXED_BOTTLE] })).toEqual({
      startedAt: AC3_MIXED_BOTTLE.occurredAt,
      endedAt: AC3_MIXED_BOTTLE.occurredAt,
    })
  })

  it("starts at a bottle given before the first segment", () => {
    const feed = {
      segments: [{ side: "right", startedAt: T0 + 5 * MINUTE, endedAt: T0 + 20 * MINUTE }],
      portions: [{ occurredAt: T0, breastMilkMl: 30, formulaMl: 0 }],
    } as const
    expect(sessionBounds(feed)).toEqual({ startedAt: T0, endedAt: T0 + 20 * MINUTE })
  })

  it("is null for an empty feed", () => {
    expect(sessionBounds({ segments: [], portions: [] })).toBeNull()
  })
})
