import { describe, expect, it } from "vitest"
import { isComplete, pastFeedEntry, pastFeedSession } from "../src/features/feed/past-feed.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const MINUTE = 60_000
const START = Date.UTC(2026, 9, 9, 9, 10)
const ZONE = "America/Vancouver"

const feed = (
  left: number | null,
  right: number | null,
  breastMilkMl: number | null = 0,
  formulaMl: number | null = 0,
) => ({ first: "right", minutes: { left, right }, breastMilkMl, formulaMl }) as const

describe("pastFeedEntry", () => {
  it("lays the sides end to end from the start, first side first, with the bottle at the end", () => {
    expect(pastFeedEntry(ACTION_ID, START, feed(12, 8, 40, 0))).toEqual({
      actionId: ACTION_ID,
      segments: [
        { side: "right", startedAt: START, endedAt: START + 8 * MINUTE },
        { side: "left", startedAt: START + 8 * MINUTE, endedAt: START + 20 * MINUTE },
      ],
      portions: [{ occurredAt: START + 20 * MINUTE, breastMilkMl: 40, formulaMl: 0 }],
    })
  })

  it("leaves out a side with no minutes, and a bottle with no milk", () => {
    expect(pastFeedEntry(ACTION_ID, START, feed(15, 0))).toEqual({
      actionId: ACTION_ID,
      segments: [{ side: "left", startedAt: START, endedAt: START + 15 * MINUTE }],
      portions: [],
    })
  })
})

describe("isComplete", () => {
  it("needs some nursing or some milk, every field readable, and no side past four hours", () => {
    expect(isComplete(feed(0, 0))).toBe(false)
    expect(isComplete(feed(0, 0, 30))).toBe(true)
    expect(isComplete(feed(null, 5))).toBe(false)
    expect(isComplete(feed(241, 0))).toBe(false)
    expect(isComplete(feed(240, 0))).toBe(true)
    expect(isComplete(feed(5, 0, null))).toBe(false)
  })
})

describe("pastFeedSession", () => {
  it("starts half an hour back, on the left, with nothing filled in", () => {
    const session = pastFeedSession(null, START + 30 * MINUTE, ZONE)
    expect(session).toMatchObject({
      when: { kind: "at", local: "2026-10-09T02:10", pick: null },
      first: "left",
      minutes: { left: 0, right: 0 },
      breastMilkMl: 0,
      formulaMl: 0,
    })
  })

  it("reopens a feed that wasn't saved with what it held and the same actionId", () => {
    const payload = pastFeedEntry(ACTION_ID, START, feed(12, 8, 40, 10))
    const failed = {
      sending: { sheet: "pastFeed" as const, action: { kind: "logFeed" as const, payload } },
      error: new Error("offline"),
    }
    expect(pastFeedSession(failed, START + 60 * MINUTE, ZONE)).toEqual({
      actionId: ACTION_ID,
      when: { kind: "at", local: "2026-10-09T02:10", pick: null },
      first: "right",
      minutes: { left: 12, right: 8 },
      breastMilkMl: 40,
      formulaMl: 10,
    })
  })
})
