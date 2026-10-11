import { FeedConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { emptiedBy, finishingAfter, sentStop, startSession } from "../src/features/feed/nursing-session.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { NOW as WHEN_NOW, whenAt } from "../src/sheets/when.ts"
import { feedAt, MINUTE, NOW, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const STARTED_AT = NOW - 20 * MINUTE
const STOPPED_AT = NOW - 5 * MINUTE

const failedWith = (sending: Sending, error: Error = new Offline()): Failed => ({ sending, error })

const START: Sending = {
  sheet: "nursing",
  action: { kind: "startFeed", payload: { actionId: ACTION_ID, side: "right", startedAt: STARTED_AT } },
}

const SWITCH: Sending = {
  sheet: "nursing",
  action: { kind: "switchSide", id: "feed-1", payload: { actionId: ACTION_ID, version: 2, occurredAt: STOPPED_AT } },
}

const FINISH: Sending = {
  sheet: "nursing",
  action: {
    kind: "finishFeed",
    id: "feed-1",
    payload: { actionId: ACTION_ID, version: 2, occurredAt: STOPPED_AT, deleteIfEmpty: false },
  },
}

const HOUSEHOLD_COPY = feedAt(STARTED_AT, {
  id: "feed-1",
  status: "active",
  endedAt: null,
  segments: [{ id: "segment-1", side: "left", startedAt: STARTED_AT, endedAt: null }],
  version: 3,
})

const EMPTY = new FeedConflict({ code: "FEED_EMPTY", current: HOUSEHOLD_COPY })
const STALE = new FeedConflict({ code: "STALE_VERSION", current: HOUSEHOLD_COPY })

describe("startSession", () => {
  it("starts at Now under a new actionId each time when nothing failed", () => {
    const first = startSession(null, ZONE)
    const second = startSession(null, ZONE)
    expect(first.actionId).toMatch(UUID)
    expect(second.actionId).toMatch(UUID)
    expect(second.actionId).not.toBe(first.actionId)
    expect(first.when).toEqual(WHEN_NOW)
  })

  it("picks a failed start up where it left off: the same actionId, and the time sent on the household's clock", () => {
    expect(startSession(failedWith(START), ZONE)).toEqual({ actionId: ACTION_ID, when: whenAt(STARTED_AT, ZONE) })
  })

  it("starts over when the failure wasn't a started feed", () => {
    const session = startSession(failedWith(SWITCH), ZONE)
    expect(session.actionId).toMatch(UUID)
    expect(session.actionId).not.toBe(ACTION_ID)
    expect(session.when).toEqual(WHEN_NOW)
  })
})

describe("sentStop", () => {
  it("reopens a stop time that wasn't saved, on the household's clock", () => {
    expect(sentStop(failedWith(FINISH), ZONE)).toEqual(whenAt(STOPPED_AT, ZONE))
  })

  it("stops at Now when nothing failed or the failure wasn't a finish", () => {
    expect(sentStop(null, ZONE)).toEqual(WHEN_NOW)
    expect(sentStop(failedWith(SWITCH), ZONE)).toEqual(WHEN_NOW)
  })
})

describe("emptiedBy", () => {
  it("hands back the household's copy and the stop time sent when a finish would leave the feed empty", () => {
    expect(emptiedBy(failedWith(FINISH, EMPTY))).toEqual({ current: HOUSEHOLD_COPY, stoppedAt: STOPPED_AT })
  })

  it("stays quiet for a finish that failed for another reason", () => {
    expect(emptiedBy(failedWith(FINISH, STALE))).toBeNull()
    expect(emptiedBy(failedWith(FINISH))).toBeNull()
  })

  it("stays quiet when the empty feed wasn't a finish's doing, or nothing failed", () => {
    expect(emptiedBy(failedWith(SWITCH, EMPTY))).toBeNull()
    expect(emptiedBy(null)).toBeNull()
  })
})

describe("finishingAfter", () => {
  it("reopens the finish step after a finish that failed, whatever the reason", () => {
    expect(finishingAfter(failedWith(FINISH))).toBe(true)
    expect(finishingAfter(failedWith(FINISH, EMPTY))).toBe(true)
  })

  it("stays on the running controls after anything else", () => {
    expect(finishingAfter(null)).toBe(false)
    expect(finishingAfter(failedWith(SWITCH))).toBe(false)
    expect(finishingAfter(failedWith(START))).toBe(false)
  })
})
