import { Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { type Diaper, Last24h, Prefill, RecentEntries, RecentEntry, Today, Totals } from "../src/index.ts"

const AT = Date.UTC(2026, 9, 8, 14, 30)

const TOTALS: Totals = {
  feedsStarted: 2,
  leftSeconds: 600,
  rightSeconds: 300,
  nursingSeconds: 900,
  breastMilkMl: 540.5,
  formulaMl: 20,
  bottleMl: 560.5,
  diapers: 3,
  wetDiapers: 2,
  dirtyDiapers: 2,
  sleepsStarted: 2,
  sleepSeconds: 7200,
  napSeconds: 5400,
  nightSeconds: 1800,
  longestSleepSeconds: 5400,
}

const DIAPER: Diaper = {
  id: "diaper-1",
  occurredAt: AT,
  wet: true,
  dirty: false,
  version: 1,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-1",
  updatedAt: AT,
  deletedAt: null,
}

const decodes = <A, I extends Schema.Json>(schema: Schema.Codec<A, I>, input: Schema.Json) =>
  Exit.isSuccess(Schema.decodeUnknownExit(Schema.toCodecJson(schema))(input))

describe("Totals", () => {
  it("counts in whole numbers and totals bottles in mL, past the 500 mL one bottle can hold", () => {
    expect(decodes(Totals, TOTALS)).toBe(true)
  })

  it.each([
    ["a negative count", { diapers: -1 }],
    ["part of a feed", { feedsStarted: 1.5 }],
    ["part of a second", { leftSeconds: 0.5 }],
    ["a negative amount", { formulaMl: -0.1 }],
    ["part of a sleep", { sleepsStarted: 0.5 }],
    ["part of a second asleep", { napSeconds: 0.5 }],
    ["a negative longest sleep", { longestSleepSeconds: -1 }],
  ])("refuses %s", (_label, change) => {
    expect(decodes(Totals, { ...TOTALS, ...change })).toBe(false)
  })
})

describe("Prefill", () => {
  it("offers the last bottle's amounts and the last side nursed, or nothing for each", () => {
    expect(decodes(Prefill, { lastBottle: { breastMilkMl: 40, formulaMl: 20 }, lastSide: "right" })).toBe(true)
    expect(decodes(Prefill, { lastBottle: null, lastSide: null })).toBe(true)
  })
})

describe("a recent entry", () => {
  it("says which kind of record it carries", () => {
    expect(decodes(RecentEntry, { kind: "diaper", diaper: DIAPER })).toBe(true)
    expect(decodes(RecentEntry, { kind: "feed", diaper: DIAPER })).toBe(false)
  })
})

describe("Last24h", () => {
  it("says when the 24 hours began", () => {
    expect(decodes(Last24h, { from: AT, totals: TOTALS })).toBe(true)
    expect(decodes(Last24h, { from: "yesterday", totals: TOTALS })).toBe(false)
  })
})

describe("Today's recent entries", () => {
  const decodeRecent = Schema.decodeUnknownSync(Schema.toCodecJson(RecentEntries))
  const SECOND = { kind: "diaper", diaper: { ...DIAPER, id: "diaper-2" } }
  const SLEEP = { kind: "sleep", sleep: { id: "sleep-1", startedAt: AT, endedAt: null } }

  it("skips an entry of a kind this app doesn't know yet, such as M3's sleep, and keeps the rest in order", () => {
    expect(decodeRecent([{ kind: "diaper", diaper: DIAPER }, SLEEP, SECOND])).toEqual([
      { kind: "diaper", diaper: DIAPER },
      SECOND,
    ])
  })

  it("skips an entry it can't read, as the socket skips a key it can't read", () => {
    expect(decodeRecent([{ kind: "diaper", diaper: { ...DIAPER, occurredAt: "noon" } }, SECOND])).toEqual([SECOND])
  })

  it("sends every entry as it is", () => {
    expect(Schema.encodeSync(Schema.toCodecJson(RecentEntries))([{ kind: "diaper", diaper: DIAPER }])).toEqual([
      { kind: "diaper", diaper: DIAPER },
    ])
  })

  it("lets Today decode while its recent list holds a kind this app doesn't know", () => {
    const today = {
      date: "2026-10-08",
      totals: TOTALS,
      activeFeed: null,
      lastFeed: null,
      prefill: { lastBottle: null, lastSide: null },
      recent: [SLEEP, { kind: "diaper", diaper: DIAPER }],
    }
    expect(decodes(Today, today)).toBe(true)
  })
})
