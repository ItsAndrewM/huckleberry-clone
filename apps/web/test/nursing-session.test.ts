import { FeedConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import {
  backAsksFirst,
  emptiedBy,
  finishingAfter,
  finishLetGo,
  startedAtOf,
  startSession,
  stoppedAtOf,
  stopSession,
} from "../src/features/feed/nursing-session.ts"
import type { Failed, Sending } from "../src/sheets/sending.ts"
import { NOW as WHEN_NOW, whenAt } from "../src/sheets/when.ts"
import { feedAt, MINUTE, NOW, ZONE } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const STARTED_AT = NOW - 20 * MINUTE + 12_000
const STOPPED_AT = NOW - 5 * MINUTE + 37_000

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
    expect(startSession(failedWith(START), ZONE)).toEqual({
      actionId: ACTION_ID,
      when: whenAt(STARTED_AT, ZONE),
      startedAt: STARTED_AT,
    })
  })

  it("starts at the failed start's own instant until its time is changed", () => {
    const session = startSession(failedWith(START), ZONE)
    expect(startedAtOf(session, session.when, ZONE, NOW)).toEqual({ ok: true, instant: STARTED_AT })
    expect(startedAtOf(session, WHEN_NOW, ZONE, NOW)).toEqual({ ok: true, instant: NOW })
  })

  it("starts over when the failure wasn't a started feed", () => {
    const session = startSession(failedWith(SWITCH), ZONE)
    expect(session.actionId).toMatch(UUID)
    expect(session.actionId).not.toBe(ACTION_ID)
    expect(session.when).toEqual(WHEN_NOW)
  })
})

describe("stopSession", () => {
  it("reopens a stop that wasn't saved with its actionId and its time on the household's clock", () => {
    expect(stopSession(failedWith(FINISH), "feed-1", ZONE)).toEqual({
      actionId: ACTION_ID,
      when: whenAt(STOPPED_AT, ZONE),
      stoppedAt: STOPPED_AT,
    })
  })

  it("stops at Now under a new actionId when nothing failed or the failure wasn't a finish", () => {
    for (const failed of [null, failedWith(SWITCH)]) {
      const session = stopSession(failed, "feed-1", ZONE)
      expect(session).toEqual({ actionId: expect.stringMatching(UUID), when: WHEN_NOW, stoppedAt: null })
      expect(session.actionId).not.toBe(ACTION_ID)
    }
  })

  it("stops at the failed stop's own instant until its time is changed", () => {
    const session = stopSession(failedWith(FINISH), "feed-1", ZONE)
    expect(stoppedAtOf(session, session.when, ZONE, NOW, STARTED_AT)).toEqual({ ok: true, instant: STOPPED_AT })
    expect(stoppedAtOf(session, WHEN_NOW, ZONE, NOW, STARTED_AT)).toEqual({ ok: true, instant: NOW })
  })

  it("stops fresh at Now on another feed, so a finish held for one feed can't stop another", () => {
    const session = stopSession(failedWith(FINISH), "feed-2", ZONE)
    expect(session).toEqual({ actionId: expect.stringMatching(UUID), when: WHEN_NOW, stoppedAt: null })
    expect(session.actionId).not.toBe(ACTION_ID)
  })

  it("stops fresh at Now once its held stop is let go on the Nursing sheet, and never when it started fresh", () => {
    const session = stopSession(failedWith(FINISH), "feed-1", ZONE)
    const shown = { open: "nursing" as const, busy: null }
    expect(finishLetGo(session, null, shown)).toBe(true)
    expect([
      finishLetGo(session, failedWith(FINISH), shown),
      finishLetGo(stopSession(null, "feed-1", ZONE), null, shown),
      finishLetGo(session, null, { open: "sleep", busy: null }),
    ]).toEqual([false, false, false])
  })

  it("asks for a time after the side started when the side now starts after the held stop", () => {
    const session = stopSession(failedWith(FINISH), "feed-1", ZONE)
    expect(stoppedAtOf(session, session.when, ZONE, NOW, STOPPED_AT + 10 * MINUTE)).toEqual({
      ok: false,
      issue: "too_early",
    })
  })
})

describe("emptiedBy", () => {
  it("hands back the failed finish, the household's copy and the stop time sent when a finish would leave the feed empty", () => {
    const failed = failedWith(FINISH, EMPTY)
    expect(emptiedBy(failed)).toEqual({ failed, current: HOUSEHOLD_COPY, stoppedAt: STOPPED_AT })
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

describe("backAsksFirst", () => {
  it("asks before Back lets go of a finish that could still be saved, by Try again or Finish anyway", () => {
    expect(backAsksFirst(failedWith(FINISH))).toBe(true)
    expect(backAsksFirst(failedWith(FINISH, new Error("Not saved")))).toBe(true)
    expect(backAsksFirst(failedWith(FINISH, STALE))).toBe(true)
  })

  it("lets Back go without asking after a finish that nothing would save, or anything else", () => {
    const finished = { ...HOUSEHOLD_COPY, status: "completed" as const, endedAt: STOPPED_AT }
    expect(backAsksFirst(failedWith(FINISH, new FeedConflict({ code: "STALE_VERSION", current: finished })))).toBe(
      false,
    )
    expect(backAsksFirst(failedWith(FINISH, EMPTY))).toBe(false)
    expect(backAsksFirst(failedWith(SWITCH))).toBe(false)
    expect(backAsksFirst(null)).toBe(false)
  })
})
