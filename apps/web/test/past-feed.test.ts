import { FUTURE_TOLERANCE_MS } from "@bt/domain"
import { describe, expect, it } from "vitest"
import {
  canSavePastFeed,
  endsInFuture,
  futureEnd,
  isComplete,
  latestInstant,
  minutesFromText,
  pastFeedEntry,
  pastFeedSession,
} from "../src/features/feed/past-feed.ts"
import { NOW as WHEN_NOW, whenAt } from "../src/sheets/when.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const MINUTE = 60_000
const START = Date.UTC(2026, 9, 9, 9, 10)
const NOW = START + 30 * MINUTE
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
    const session = pastFeedSession(null, START + 30 * MINUTE, ZONE, null)
    expect(session).toMatchObject({
      when: { kind: "at", local: "2026-10-09T02:10", pick: null },
      first: "left",
      minutes: { left: 0, right: 0 },
      breastMilkMl: 0,
      formulaMl: 0,
    })
  })

  it("starts at the time it was opened at, from History's empty slot, rather than half an hour back", () => {
    const session = pastFeedSession(null, START + 300 * MINUTE, ZONE, START + 5 * MINUTE)
    expect(session.when).toEqual({ kind: "at", local: "2026-10-09T02:15", pick: null })
  })

  const unsaved = {
    sending: {
      sheet: "pastFeed" as const,
      action: { kind: "logFeed" as const, payload: pastFeedEntry(ACTION_ID, START, feed(12, 8, 40, 10)) },
    },
    error: new Error("offline"),
  }

  it("keeps a failed save's own start over the time the sheet was opened at", () => {
    const session = pastFeedSession(unsaved, START + 60 * MINUTE, ZONE, START + 45 * MINUTE)
    expect(session.when).toEqual({ kind: "at", local: "2026-10-09T02:10", pick: null })
  })

  it("reopens a feed that wasn't saved with what it held and the same actionId", () => {
    expect(pastFeedSession(unsaved, START + 60 * MINUTE, ZONE, null)).toEqual({
      actionId: ACTION_ID,
      when: { kind: "at", local: "2026-10-09T02:10", pick: null },
      first: "right",
      minutes: { left: 12, right: 8 },
      breastMilkMl: 40,
      formulaMl: 10,
    })
  })
})

describe("minutesFromText", () => {
  it("reads whole minutes up to four hours, and a field left blank as none", () => {
    expect(minutesFromText("12")).toBe(12)
    expect(minutesFromText(" 8 ")).toBe(8)
    expect(minutesFromText("240")).toBe(240)
    expect(minutesFromText("")).toBe(0)
    expect(minutesFromText("   ")).toBe(0)
  })

  it("refuses anything but digits, and a side past four hours", () => {
    expect(minutesFromText("241")).toBeNull()
    expect(minutesFromText("1e1")).toBeNull()
    expect(minutesFromText("0x10")).toBeNull()
    expect(minutesFromText("15.5")).toBeNull()
    expect(minutesFromText("-1")).toBeNull()
    expect(minutesFromText("1 2")).toBeNull()
    expect(minutesFromText("abc")).toBeNull()
  })
})

describe("latestInstant", () => {
  it("is where the last side ends, or the start for a bottle with no nursing", () => {
    expect(latestInstant(START, feed(12, 8, 40))).toBe(START + 20 * MINUTE)
    expect(latestInstant(START, feed(0, 15))).toBe(START + 15 * MINUTE)
    expect(latestInstant(START, feed(0, 0, 40))).toBe(START)
  })

  it("is the time pastFeedEntry gives the bottle", () => {
    const nursed = feed(12, 8, 40)
    const bottleOnly = feed(0, 0, 40)
    expect(pastFeedEntry(ACTION_ID, START, nursed).portions[0]?.occurredAt).toBe(latestInstant(START, nursed))
    expect(pastFeedEntry(ACTION_ID, START, bottleOnly).portions[0]?.occurredAt).toBe(latestInstant(START, bottleOnly))
  })
})

describe("endsInFuture", () => {
  it("allows the household's five minutes ahead and no more", () => {
    expect(endsInFuture(NOW + FUTURE_TOLERANCE_MS, NOW)).toBe(false)
    expect(endsInFuture(NOW + FUTURE_TOLERANCE_MS + 1, NOW)).toBe(true)
  })

  it("finds 20 and 20 minutes from a start half an hour back ending ahead, and 10 and 10 not", () => {
    expect(endsInFuture(latestInstant(START, feed(20, 20)), NOW)).toBe(true)
    expect(endsInFuture(latestInstant(START, feed(10, 10)), NOW)).toBe(false)
  })

  it("puts a bottle with no nursing at the start", () => {
    expect(endsInFuture(latestInstant(START, feed(0, 0, 40)), NOW)).toBe(false)
    expect(endsInFuture(latestInstant(NOW + 6 * MINUTE, feed(0, 0, 40)), NOW)).toBe(true)
  })
})

describe("futureEnd", () => {
  const { when } = pastFeedSession(null, NOW, ZONE, null)

  it("is where a feed from the default start would end, when that is ahead of the household's clock", () => {
    expect(futureEnd(feed(20, 20), when, ZONE, NOW)).toBe(START + 40 * MINUTE)
    expect(futureEnd(feed(10, 10), when, ZONE, NOW)).toBeNull()
  })

  it("says nothing of a bottle with no nursing, or of a start that doesn't resolve", () => {
    expect(futureEnd(feed(0, 0, 40), when, ZONE, NOW)).toBeNull()
    expect(futureEnd(feed(20, 20), { kind: "at", local: "", pick: null }, ZONE, NOW)).toBeNull()
  })

  it("starts Now from the moment it is given", () => {
    expect(futureEnd(feed(6, 0), WHEN_NOW, ZONE, NOW)).toBe(NOW + 6 * MINUTE)
    expect(futureEnd(feed(5, 0), WHEN_NOW, ZONE, NOW)).toBeNull()
  })
})

describe("canSavePastFeed", () => {
  const { when } = pastFeedSession(null, NOW, ZONE, null)

  it("is ready with something to log, a start that resolves and an end that isn't ahead", () => {
    expect(canSavePastFeed(feed(10, 10), when, ZONE, NOW)).toBe(true)
    expect(canSavePastFeed(feed(0, 0, 40), when, ZONE, NOW)).toBe(true)
  })

  it("waits for something to log", () => {
    expect(canSavePastFeed(feed(0, 0), when, ZONE, NOW)).toBe(false)
    expect(canSavePastFeed(feed(null, 5), when, ZONE, NOW)).toBe(false)
  })

  it("waits for a start that resolves and isn't ahead", () => {
    expect(canSavePastFeed(feed(10, 10), { kind: "at", local: "", pick: null }, ZONE, NOW)).toBe(false)
    expect(canSavePastFeed(feed(10, 10), whenAt(NOW + 10 * MINUTE, ZONE), ZONE, NOW)).toBe(false)
  })

  it("refuses an end ahead of the household's clock until the clock catches up", () => {
    expect(canSavePastFeed(feed(20, 20), when, ZONE, NOW)).toBe(false)
    expect(canSavePastFeed(feed(20, 20), when, ZONE, NOW + 6 * MINUTE)).toBe(true)
    expect(canSavePastFeed(feed(6, 0), WHEN_NOW, ZONE, NOW)).toBe(false)
    expect(canSavePastFeed(feed(5, 0), WHEN_NOW, ZONE, NOW)).toBe(true)
  })
})
