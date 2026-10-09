import { Exit, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  ComponentDelete,
  Feed,
  FeedConflict,
  FeedFinish,
  invalidInputFrom,
  MAX_FEED_COMPONENTS,
  Millilitres,
  NewFeed,
  SegmentEdit,
  VersionedPortion,
} from "../src/index.ts"

const ACTION_ID = "8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f"
const AT = Date.UTC(2026, 9, 8, 14, 30)
const MINUTE_MS = 60_000

const LEFT = { side: "left", startedAt: AT, endedAt: AT + 15 * MINUTE_MS }
const BOTTLE = { occurredAt: AT + 20 * MINUTE_MS, breastMilkMl: 40, formulaMl: 20 }

const FEED: Feed = {
  id: "feed-1",
  status: "active",
  startedAt: AT,
  endedAt: null,
  segments: [
    { id: "segment-1", side: "left", startedAt: AT, endedAt: AT + 15 * MINUTE_MS },
    { id: "segment-2", side: "right", startedAt: AT + 15 * MINUTE_MS, endedAt: null },
  ],
  portions: [{ id: "portion-1", occurredAt: AT + 5 * MINUTE_MS, breastMilkMl: 30, formulaMl: 0 }],
  version: 3,
  createdBy: "caregiver-1",
  createdAt: AT,
  updatedBy: "caregiver-2",
  updatedAt: AT + 15 * MINUTE_MS,
  deletedAt: null,
}

const fieldErrors = <A, I extends Schema.Json>(schema: Schema.Codec<A, I>, input: Schema.Json) => {
  const decoded = Schema.decodeUnknownResult(Schema.toCodecJson(schema), { errors: "all" })(input)
  return Result.isFailure(decoded) ? invalidInputFrom(decoded.failure.issue).fieldErrors : []
}

const decodes = <A, I extends Schema.Json>(schema: Schema.Codec<A, I>, input: Schema.Json) =>
  Exit.isSuccess(Schema.decodeUnknownExit(Schema.toCodecJson(schema))(input))

describe("Millilitres", () => {
  it.each([0, 0.1, 40.5, 60, 500])("accepts %d", (ml) => {
    expect(decodes(Millilitres, ml)).toBe(true)
  })

  it.each([-0.1, 500.1, 40.15, "60", "NaN", null])("refuses %j", (ml) => {
    expect(decodes(Millilitres, ml)).toBe(false)
  })
})

describe("a new feed", () => {
  it.each([
    ["nursing only", { segments: [LEFT], portions: [] }],
    ["a bottle only", { segments: [], portions: [BOTTLE] }],
    ["both", { segments: [LEFT], portions: [BOTTLE] }],
  ])("can be %s", (_label, components) => {
    expect(fieldErrors(NewFeed, { actionId: ACTION_ID, ...components })).toEqual([])
  })

  it("needs a segment or a bottle, and names both lists when it has neither", () => {
    expect(fieldErrors(NewFeed, { actionId: ACTION_ID, segments: [], portions: [] })).toEqual([
      { path: "segments", issue: "invalid" },
      { path: "portions", issue: "invalid" },
    ])
  })

  it("refuses a bottle with no milk in it, naming both amounts", () => {
    const empty = { ...BOTTLE, breastMilkMl: 0, formulaMl: 0 }
    expect(fieldErrors(NewFeed, { actionId: ACTION_ID, segments: [], portions: [empty] })).toEqual([
      { path: "portions.0.breastMilkMl", issue: "invalid" },
      { path: "portions.0.formulaMl", issue: "invalid" },
    ])
  })

  it(`holds at most ${MAX_FEED_COMPONENTS} segments and ${MAX_FEED_COMPONENTS} bottles`, () => {
    const most = { actionId: ACTION_ID, segments: Array(20).fill(LEFT), portions: Array(20).fill(BOTTLE) }
    expect(fieldErrors(NewFeed, most)).toEqual([])
    const tooMany = { ...most, segments: Array(21).fill(LEFT), portions: Array(21).fill(BOTTLE) }
    expect(fieldErrors(NewFeed, tooMany)).toEqual([
      { path: "segments", issue: "invalid" },
      { path: "portions", issue: "invalid" },
    ])
  })

  it("names every field that's missing or bad, including a segment that never ended", () => {
    const segment = { side: "middle", startedAt: AT, endedAt: null }
    const bottle = { occurredAt: AT / 1000, breastMilkMl: 40.15 }
    expect(fieldErrors(NewFeed, { actionId: "first", segments: [segment], portions: [bottle] })).toEqual([
      { path: "actionId", issue: "invalid" },
      { path: "segments.0.side", issue: "invalid" },
      { path: "segments.0.endedAt", issue: "invalid" },
      { path: "portions.0.occurredAt", issue: "invalid" },
      { path: "portions.0.breastMilkMl", issue: "invalid" },
      { path: "portions.0.formulaMl", issue: "invalid" },
    ])
  })
})

describe("an edit to a segment", () => {
  const edit = { actionId: ACTION_ID, version: 3, side: "right", startedAt: AT, endedAt: AT + 10 * MINUTE_MS }

  it("carries every field and the feed's version, with no end for the running segment", () => {
    expect(fieldErrors(SegmentEdit, edit)).toEqual([])
    expect(fieldErrors(SegmentEdit, { ...edit, endedAt: null })).toEqual([])
    const unversioned = { actionId: ACTION_ID, side: "right", startedAt: AT, endedAt: AT + 10 * MINUTE_MS }
    expect(fieldErrors(SegmentEdit, unversioned)).toEqual([{ path: "version", issue: "invalid" }])
  })
})

describe("a bottle added to a feed, or an edit to one", () => {
  it("carries the feed's version and refuses a bottle with no milk in it", () => {
    const portion = { actionId: ACTION_ID, version: 2, ...BOTTLE }
    expect(fieldErrors(VersionedPortion, portion)).toEqual([])
    expect(fieldErrors(VersionedPortion, { ...portion, breastMilkMl: 0, formulaMl: 0 })).toEqual([
      { path: "breastMilkMl", issue: "invalid" },
      { path: "formulaMl", issue: "invalid" },
    ])
  })
})

describe("finishing a feed, and deleting a segment or a bottle", () => {
  it("say whether to delete the feed when the change would leave it empty", () => {
    expect(fieldErrors(FeedFinish, { actionId: ACTION_ID, version: 2, occurredAt: AT })).toEqual([
      { path: "deleteIfEmpty", issue: "invalid" },
    ])
    expect(fieldErrors(ComponentDelete, { actionId: ACTION_ID, version: 2, deleteIfEmpty: false })).toEqual([])
  })
})

describe("a feed", () => {
  it("can be running, with no end and an open segment", () => {
    expect(decodes(Feed, FEED)).toBe(true)
  })
})

describe("FeedConflict", () => {
  const decode = Schema.decodeUnknownExit(Schema.toCodecJson(FeedConflict))

  it.each(["FEED_ALREADY_ACTIVE", "SEGMENT_OVERLAP", "FEED_EMPTY", "STALE_VERSION", "ACTION_REPLAY_MISMATCH"])(
    "carries %s with the feed it's about",
    (code) => {
      const exit = decode({ _tag: "Conflict", code, current: FEED })
      expect(Exit.isSuccess(exit) && exit.value.current).toEqual(FEED)
    },
  )

  it("refuses a code a feed can't conflict on", () => {
    expect(Exit.isFailure(decode({ _tag: "Conflict", code: "SLEEP_OVERLAP", current: FEED }))).toBe(true)
  })
})
