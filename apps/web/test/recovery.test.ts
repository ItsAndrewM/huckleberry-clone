import { DiaperConflict, type Feed, FeedConflict, InvalidInput } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { settlesWithoutAsking } from "../src/sheets/held.ts"
import { offersOk, recoveryOf } from "../src/sheets/recovery.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { diaperAt, feedAt, MINUTE, NOW } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const FRESH = "9d2e1f3c-5b4a-4e6d-8c7b-1a0f2e3d4c5b"
const TAP = { at: NOW + MINUTE, actionId: FRESH }
const STARTED = NOW - 20 * MINUTE
const MINE = { actionId: ACTION_ID, version: 2, occurredAt: NOW }

const segment = (side: "left" | "right", startedAt: number, endedAt: number | null) => ({
  id: `segment-${startedAt}`,
  side,
  startedAt,
  endedAt,
})

const theirs = (change: Partial<Feed> = {}): Feed =>
  feedAt(STARTED, {
    id: "feed-1",
    status: "active",
    endedAt: null,
    version: 3,
    segments: [segment("left", STARTED, null)],
    ...change,
  })

const PAUSED = theirs({ segments: [segment("left", STARTED, NOW - 5 * MINUTE)] })

const SWITCHED_AFTER_TAP = theirs({
  segments: [segment("left", STARTED, NOW + 5_000), segment("right", NOW + 5_000, null)],
})

const SWITCHED_EARLIER = theirs({
  segments: [segment("left", STARTED, NOW - 5 * MINUTE), segment("right", NOW - 5 * MINUTE, null)],
})

const SWITCH: Sending = { sheet: "nursing", action: { kind: "switchSide", id: "feed-1", to: "right", payload: MINE } }

const JOINING: Sending = { sheet: "nursing", action: { kind: "switchSide", id: "feed-1", to: "left", payload: MINE } }

const EDIT_DIAPER: Sending = {
  sheet: "diaper",
  action: {
    kind: "editDiaper",
    id: "diaper-1",
    payload: { actionId: ACTION_ID, version: 2, occurredAt: NOW, wet: false, dirty: true },
  },
}

const PAUSE: Sending = { sheet: "nursing", action: { kind: "pauseFeed", id: "feed-1", payload: MINE } }

const RESUME: Sending = {
  sheet: "nursing",
  action: { kind: "resumeFeed", id: "feed-1", payload: { ...MINE, side: "right" } },
}

const finish = (occurredAt: number, deleteIfEmpty = false): Sending => ({
  sheet: "nursing",
  action: { kind: "finishFeed", id: "feed-1", payload: { ...MINE, occurredAt, deleteIfEmpty } },
})

const addBottle = (occurredAt: number): Sending => ({
  sheet: "bottle",
  action: { kind: "addBottle", id: "feed-1", payload: { ...MINE, occurredAt, breastMilkMl: 60, formulaMl: 0 } },
})

const start = (side: "left" | "right"): Sending => ({
  sheet: "nursing",
  action: { kind: "startFeed", payload: { actionId: ACTION_ID, side, startedAt: NOW } },
})

const BOTTLE_FEED: Sending = {
  sheet: "bottle",
  action: {
    kind: "logFeed",
    payload: { actionId: ACTION_ID, segments: [], portions: [{ occurredAt: NOW, breastMilkMl: 90, formulaMl: 0 }] },
  },
}

const PAST_FEED: Sending = {
  sheet: "pastFeed",
  action: {
    kind: "logFeed",
    payload: { actionId: ACTION_ID, segments: [{ side: "left", startedAt: STARTED, endedAt: NOW }], portions: [] },
  },
}

const DIAPER: Sending = {
  sheet: "diaper",
  action: { kind: "logDiaper", payload: { actionId: ACTION_ID, occurredAt: NOW, wet: false, dirty: true } },
}

const feedConflict = (sending: Sending, code: FeedConflict["code"], current: Feed): Failed => ({
  sending,
  error: new FeedConflict({ code, current }),
})

const SAVED_BOTTLE = feedAt(NOW, {
  id: "feed-2",
  version: 1,
  portions: [{ id: "portion-1", occurredAt: NOW, breastMilkMl: 60, formulaMl: 0 }],
})

const SAVED_DIAPER = diaperAt(NOW - MINUTE, { id: "diaper-1", version: 2 })

describe("a redo after the other phone's change", () => {
  it("redoes a switch whose open side started before the tap, under the same actionId and the feed's version", () => {
    const recovery = recoveryOf(feedConflict(SWITCH, "STALE_VERSION", theirs()))
    expect(recovery?.label).toBe("Switch anyway")
    expect(recovery?.sendingAt(TAP)).toEqual({
      sheet: "nursing",
      action: { kind: "switchSide", id: "feed-1", to: "right", payload: { ...MINE, version: 3 } },
    })
  })

  it.each([
    { label: "Pause anyway", sending: PAUSE, current: theirs() },
    { label: "Resume anyway", sending: RESUME, current: PAUSED },
    { label: "Finish anyway", sending: finish(NOW), current: PAUSED },
    { label: "Finish anyway", sending: finish(NOW), current: theirs() },
    { label: "Add it anyway", sending: addBottle(NOW), current: theirs() },
    { label: "Add it anyway", sending: addBottle(STARTED), current: theirs() },
  ])("offers $label when the tap still fits the feed", ({ label, sending, current }) => {
    const recovery = recoveryOf(feedConflict(sending, "STALE_VERSION", current))
    expect(recovery?.label).toBe(label)
    expect(recovery?.sendingAt(TAP)).toMatchObject({
      sheet: sending.sheet,
      action: { kind: sending.action.kind, payload: { actionId: ACTION_ID, version: 3 } },
    })
  })

  it.each([
    { case: "a switch after theirs", sending: SWITCH, current: SWITCHED_AFTER_TAP },
    { case: "a switch to the side theirs had already reached, unseen", sending: SWITCH, current: SWITCHED_EARLIER },
    { case: "a join's switch that meets the feed already on its side", sending: JOINING, current: theirs() },
    { case: "a pause after their switch", sending: PAUSE, current: SWITCHED_AFTER_TAP },
    { case: "a switch on a paused feed", sending: SWITCH, current: PAUSED },
    { case: "a pause on a paused feed", sending: PAUSE, current: PAUSED },
    { case: "a resume on a running feed", sending: RESUME, current: theirs() },
    {
      case: "a finish stopped before the open side started",
      sending: finish(NOW - 10 * MINUTE),
      current: SWITCHED_EARLIER,
    },
    { case: "the finish that deletes an empty feed", sending: finish(NOW, true), current: PAUSED },
    { case: "a bottle before the feed started", sending: addBottle(STARTED - MINUTE), current: theirs() },
    { case: "a switch on a completed feed", sending: SWITCH, current: theirs({ status: "completed" }) },
    { case: "a switch on a deleted feed", sending: SWITCH, current: theirs({ deletedAt: NOW }) },
    { case: "a start", sending: start("left"), current: theirs() },
  ])("doesn't redo $case", ({ sending, current }) => {
    expect(recoveryOf(feedConflict(sending, "STALE_VERSION", current))).toBeNull()
  })
})

describe("a start that meets the other phone's feed", () => {
  it("offers your side on their running feed, with their id and version, a fresh actionId and the tap's time", () => {
    const current = theirs({ segments: [segment("right", STARTED, null)] })
    const recovery = recoveryOf(feedConflict(start("left"), "FEED_ALREADY_ACTIVE", current))
    expect(recovery?.label).toBe("Switch to Left")
    expect(recovery?.sendingAt(TAP)).toEqual({
      sheet: "nursing",
      action: {
        kind: "switchSide",
        id: "feed-1",
        to: "left",
        payload: { actionId: FRESH, version: 3, occurredAt: TAP.at },
      },
    })
  })

  it("offers to resume on your side when their feed is paused", () => {
    const recovery = recoveryOf(feedConflict(start("left"), "FEED_ALREADY_ACTIVE", PAUSED))
    expect(recovery?.label).toBe("Resume on Left")
    expect(recovery?.sendingAt(TAP)).toEqual({
      sheet: "nursing",
      action: {
        kind: "resumeFeed",
        id: "feed-1",
        payload: { actionId: FRESH, version: 3, side: "left", occurredAt: TAP.at },
      },
    })
  })

  it("offers nothing when their feed already runs on your side", () => {
    expect(recoveryOf(feedConflict(start("left"), "FEED_ALREADY_ACTIVE", theirs()))).toBeNull()
  })

  it("offers nothing for a sheet's other actions", () => {
    expect(recoveryOf(feedConflict(BOTTLE_FEED, "FEED_ALREADY_ACTIVE", theirs()))).toBeNull()
  })
})

describe("an entry that was saved before, as first entered", () => {
  it("saves a diaper's changes as an edit of the saved diaper, under a fresh actionId", () => {
    const recovery = recoveryOf({
      sending: DIAPER,
      error: new DiaperConflict({ code: "ACTION_REPLAY_MISMATCH", current: SAVED_DIAPER }),
    })
    expect(recovery?.label).toBe("Save my changes")
    expect(recovery?.sendingAt(TAP)).toEqual({
      sheet: "diaper",
      action: {
        kind: "editDiaper",
        id: "diaper-1",
        payload: { actionId: FRESH, version: 2, occurredAt: NOW, wet: false, dirty: true },
      },
    })
  })

  it("saves a bottle's changes as an edit of the saved feed's only portion", () => {
    const recovery = recoveryOf(feedConflict(BOTTLE_FEED, "ACTION_REPLAY_MISMATCH", SAVED_BOTTLE))
    expect(recovery?.label).toBe("Save my changes")
    expect(recovery?.sendingAt(TAP)).toEqual({
      sheet: "bottle",
      action: {
        kind: "editPortion",
        id: "portion-1",
        payload: { actionId: FRESH, version: 1, occurredAt: NOW, breastMilkMl: 90, formulaMl: 0 },
      },
    })
  })

  it.each([
    { case: "a past feed with sides", sending: PAST_FEED, current: SAVED_BOTTLE },
    { case: "a start", sending: start("left"), current: theirs() },
    { case: "a bottle added to a running feed", sending: addBottle(NOW), current: theirs() },
    {
      case: "a bottle whose saved feed has more than one portion",
      sending: BOTTLE_FEED,
      current: {
        ...SAVED_BOTTLE,
        portions: [...SAVED_BOTTLE.portions, { id: "portion-2", occurredAt: NOW, breastMilkMl: 30, formulaMl: 0 }],
      },
    },
    {
      case: "a bottle whose saved feed has sides",
      sending: BOTTLE_FEED,
      current: { ...SAVED_BOTTLE, segments: PAUSED.segments },
    },
  ])("offers nothing to save for $case", ({ sending, current }) => {
    expect(recoveryOf(feedConflict(sending, "ACTION_REPLAY_MISMATCH", current))).toBeNull()
  })
})

describe("failures with no way on", () => {
  it.each([
    { case: "an overlap", failed: feedConflict(PAST_FEED, "SEGMENT_OVERLAP", theirs()) },
    { case: "an empty feed", failed: feedConflict(finish(NOW), "FEED_EMPTY", PAUSED) },
    {
      case: "a stale diaper",
      failed: { sending: DIAPER, error: new DiaperConflict({ code: "STALE_VERSION", current: SAVED_DIAPER }) },
    },
    { case: "no connection", failed: { sending: SWITCH, error: new Offline() } },
  ])("offers nothing for $case", ({ failed }) => {
    expect(recoveryOf(failed)).toBeNull()
  })
})

describe("OK", () => {
  it.each([
    feedConflict(SWITCH, "STALE_VERSION", theirs()),
    feedConflict(start("left"), "FEED_ALREADY_ACTIVE", theirs()),
    feedConflict(BOTTLE_FEED, "ACTION_REPLAY_MISMATCH", SAVED_BOTTLE),
    { sending: EDIT_DIAPER, error: new DiaperConflict({ code: "STALE_VERSION", current: SAVED_DIAPER }) },
    { sending: DIAPER, error: new DiaperConflict({ code: "ACTION_REPLAY_MISMATCH", current: SAVED_DIAPER }) },
  ])("settles $error.code on $sending.action.kind by accepting the household's copy", (failed) => {
    expect(offersOk(failed)).toBe(true)
  })

  it("isn't offered for a bottle top-up the other phone's change refused, since it can still be saved", () => {
    const completed = theirs({ status: "completed" })
    expect(offersOk(feedConflict(SWITCH, "STALE_VERSION", completed))).toBe(true)
    expect(offersOk(feedConflict(addBottle(NOW), "STALE_VERSION", completed))).toBe(false)
  })

  it.each([
    { case: "an overlap", failed: feedConflict(PAST_FEED, "SEGMENT_OVERLAP", theirs()) },
    { case: "an empty feed", failed: feedConflict(finish(NOW), "FEED_EMPTY", PAUSED) },
    { case: "no connection", failed: { sending: DIAPER, error: new Offline() } },
    {
      case: "a field error",
      failed: {
        sending: DIAPER,
        error: new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "in_future" }] }),
      },
    },
  ])("isn't offered for $case", ({ failed }) => {
    expect(offersOk(failed)).toBe(false)
  })
})

describe("an entry that can't be saved as it is", () => {
  it.each([
    new FeedConflict({ code: "ACTION_REPLAY_MISMATCH", current: SAVED_BOTTLE }),
    new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current: theirs() }),
    new DiaperConflict({ code: "ACTION_REPLAY_MISMATCH", current: SAVED_DIAPER }),
  ])("settles without asking after $code", (error) => {
    expect(settlesWithoutAsking(error)).toBe(true)
  })

  it.each([
    { case: "a stale version", error: new FeedConflict({ code: "STALE_VERSION", current: theirs() }) },
    { case: "an overlap", error: new FeedConflict({ code: "SEGMENT_OVERLAP", current: theirs() }) },
    { case: "an empty feed", error: new FeedConflict({ code: "FEED_EMPTY", current: PAUSED }) },
    { case: "no connection", error: new Offline() },
    { case: "a field error", error: new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "in_future" }] }) },
  ])("asks first after $case", ({ error }) => {
    expect(settlesWithoutAsking(error)).toBe(false)
  })
})
