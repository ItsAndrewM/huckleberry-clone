import {
  DiaperConflict,
  FeedConflict,
  InvalidInput,
  MeasurementConflict,
  NotFound,
  ServiceUnavailable,
  SleepConflict,
  Unauthorized,
} from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline } from "../src/api/errors.ts"
import type { DeletedRecord } from "../src/features/deleted/deleted-rows.ts"
import { restoreFailure, restoreOf, restoreWaitReason, withoutEntry } from "../src/features/deleted/restore.ts"
import type { Household } from "../src/sheets/failure.ts"
import { measurement } from "./growth-fixtures.ts"
import { ANDREW, diaperAt, EMILY, feedAt, MINUTE, NOW, nursedFor, sleptAt, ZONE } from "./today-fixtures.ts"

const HOUSEHOLD = {
  caregivers: [
    { id: ANDREW, displayName: "Andrew" },
    { id: EMILY, displayName: "Emily" },
  ],
  timeZone: ZONE,
  childName: "Robin",
  locale: "en-US",
} satisfies Household

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"

const A_DIAPER = { kind: "diaper", diaper: diaperAt(NOW - 50 * MINUTE, { deletedAt: NOW }) } satisfies DeletedRecord

const PAUSED_WHEN_DELETED = {
  kind: "feed",
  feed: { ...nursedFor(feedAt(NOW - 60 * MINUTE, { status: "active", deletedAt: NOW }), "left", 10), endedAt: null },
} satisfies DeletedRecord

const RUNNING_WHEN_DELETED = {
  kind: "feed",
  feed: {
    ...feedAt(NOW - 60 * MINUTE, { status: "active", endedAt: null, deletedAt: NOW - 59 * MINUTE }),
    segments: [{ id: "segment-1", side: "left", startedAt: NOW - 60 * MINUTE, endedAt: null }],
  },
} satisfies DeletedRecord

const failure = (error: Error, record: DeletedRecord = A_DIAPER) =>
  restoreFailure(error, HOUSEHOLD, record).replace(/\s/gu, " ")

describe("restoreOf", () => {
  it("restores each kind at its own endpoint, from the version its delete answered", () => {
    const diaper = diaperAt(NOW, { id: "diaper-1", version: 2, deletedAt: NOW })
    const feed = feedAt(NOW, { id: "feed-1", version: 4, deletedAt: NOW })
    const measured = { ...measurement("m1", NOW, { weightG: 4300 }), version: 3, deletedAt: NOW }
    expect([
      restoreOf({ kind: "diaper", diaper }, ACTION_ID),
      restoreOf({ kind: "feed", feed }, ACTION_ID),
      restoreOf({ kind: "measurement", measurement: measured }, ACTION_ID),
    ]).toEqual([
      { kind: "restoreDiaper", id: "diaper-1", payload: { actionId: ACTION_ID, version: 2 } },
      { kind: "restoreFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 4 } },
      { kind: "restoreMeasurement", id: "m1", payload: { actionId: ACTION_ID, version: 3 } },
    ])
  })
})

describe("withoutEntry", () => {
  it("takes a restored entry off the list, whatever its kind, and leaves the rest", () => {
    const diaper = diaperAt(NOW, { id: "diaper-1", deletedAt: NOW })
    const kept = diaperAt(NOW - MINUTE, { id: "diaper-2", deletedAt: NOW })
    const feed = feedAt(NOW, { id: "feed-1", deletedAt: NOW })
    const measured = { ...measurement("m1", NOW, { weightG: 4300 }), deletedAt: NOW }
    const nap = sleptAt(NOW - 120 * MINUTE, { id: "sleep-1", deletedAt: NOW })
    const deleted = { feeds: [feed], diapers: [diaper, kept], sleeps: [nap], measurements: [measured] }
    expect(withoutEntry(deleted, "diaper-1")).toEqual({ ...deleted, diapers: [kept] })
    expect(withoutEntry(deleted, "feed-1")).toEqual({ ...deleted, feeds: [] })
    expect(withoutEntry(deleted, "m1")).toEqual({ ...deleted, measurements: [] })
    expect(withoutEntry(deleted, "sleep-1")).toEqual({ ...deleted, sleeps: [] })
  })
})

describe("restoreWaitReason", () => {
  it("waits with a reason while the phone is offline or signed out", () => {
    expect(restoreWaitReason("offline")).toBe("Restoring needs a connection.")
    expect(restoreWaitReason("auth-required")).toBe("Sign in to restore.")
    expect(restoreWaitReason("online")).toBeNull()
  })
})

describe("restoreFailure", () => {
  it("says an entry from before her birth date can't come back", () => {
    const error = new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "before_birth" }] })
    expect(failure(error)).toBe("That's before Robin was born.")
  })

  it("names the running feed that stops a paused one coming back, and asks to finish it first", () => {
    const running = feedAt(NOW - 25 * MINUTE, { status: "active", endedAt: null, createdBy: EMILY })
    expect(failure(new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current: running }), PAUSED_WHEN_DELETED)).toBe(
      "Emily started a feed at 9:05 AM. Finish it, then restore this one.",
    )
  })

  it("names the feed a restored one would overlap", () => {
    const other = nursedFor(feedAt(NOW - 40 * MINUTE), "left", 15)
    expect(failure(new FeedConflict({ code: "SEGMENT_OVERLAP", current: other }), PAUSED_WHEN_DELETED)).toBe(
      "This overlaps the feed at 8:50 AM–9:05 AM.",
    )
  })

  it("says a feed still running when it was deleted can't come back over a feed logged since, rather than asking to finish that one", () => {
    const running = feedAt(NOW - 25 * MINUTE, { status: "active", endedAt: null, createdBy: EMILY })
    const other = nursedFor(feedAt(NOW - 40 * MINUTE), "left", 15)
    expect(failure(new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current: running }), RUNNING_WHEN_DELETED)).toBe(
      "It was still running when it was deleted, so it would run on over the feed Emily started at 9:05 AM. It can't come back.",
    )
    expect(failure(new FeedConflict({ code: "SEGMENT_OVERLAP", current: other }), RUNNING_WHEN_DELETED)).toBe(
      "It was still running when it was deleted, so it would run on over the feed at 8:50 AM–9:05 AM. It can't come back.",
    )
  })

  it("says the other parent restored it already, or changed it, from the copy the household sent back", () => {
    const restored = diaperAt(NOW, { version: 3, updatedBy: EMILY })
    const redeleted = { ...measurement("m1", NOW, { weightG: 4300 }), version: 4, updatedBy: EMILY, deletedAt: NOW }
    expect(failure(new DiaperConflict({ code: "STALE_VERSION", current: restored }))).toBe(
      "Emily restored this a moment ago.",
    )
    expect(failure(new MeasurementConflict({ code: "STALE_VERSION", current: redeleted }))).toBe(
      "Emily changed this a moment ago.",
    )
  })

  it("asks to try again once back online, or after signing in", () => {
    expect(failure(new Offline())).toBe("No connection. Try again once you're back online.")
    expect(failure(new AuthRequired())).toBe("Your sign-in has expired. Sign in, then try again.")
    expect(failure(new Unauthorized())).toBe("Your sign-in has expired. Sign in, then try again.")
  })

  it("says it wasn't restored for anything else", () => {
    expect(failure(new ServiceUnavailable())).toBe("Not restored. Try again.")
    expect(failure(new NotFound())).toBe("Not restored. Try again.")
    expect(failure(new Error("defect"))).toBe("Not restored. Try again.")
  })
})

describe("a deleted sleep's restore", () => {
  const NAP = sleptAt(NOW - 90 * MINUTE, { id: "sleep-1", endedAt: NOW - 30 * MINUTE, version: 2, deletedAt: NOW })
  const RUNNING = sleptAt(NOW - 40 * MINUTE, { id: "sleep-2", endedAt: null, version: 2, deletedAt: NOW })
  const THEIRS = sleptAt(NOW - 20 * MINUTE, { id: "sleep-3", kind: "night", endedAt: null, createdBy: EMILY })
  const plain = (text: string) => text.replace(/\s/gu, " ")

  it("restores at the sleep's endpoint, from the version its delete answered", () => {
    expect(restoreOf({ kind: "sleep", sleep: NAP }, ACTION_ID)).toEqual({
      kind: "restoreSleep",
      id: "sleep-1",
      payload: { actionId: ACTION_ID, version: 2 },
    })
  })

  it("names the nap or night a finished sleep would overlap", () => {
    const error = new SleepConflict({ code: "SLEEP_OVERLAP", current: THEIRS })
    expect(plain(restoreFailure(error, HOUSEHOLD, { kind: "sleep", sleep: NAP }))).toBe(
      "This overlaps the night at 9:10 AM–now.",
    )
  })

  it("says a sleep still running when it was deleted can't come back over the sleep started since", () => {
    const error = new SleepConflict({ code: "SLEEP_ALREADY_ACTIVE", current: THEIRS })
    expect(plain(restoreFailure(error, HOUSEHOLD, { kind: "sleep", sleep: RUNNING }))).toBe(
      "It was still running when it was deleted, so it would run on over the sleep Emily started at 9:10 AM. It can't come back.",
    )
  })

  it("says a sleep still running when it was deleted can't come back over a nap that started and ended since", () => {
    const logged = sleptAt(NOW - 25 * MINUTE, { id: "sleep-4", endedAt: NOW - 10 * MINUTE })
    const error = new SleepConflict({ code: "SLEEP_OVERLAP", current: logged })
    expect(plain(restoreFailure(error, HOUSEHOLD, { kind: "sleep", sleep: RUNNING }))).toBe(
      "It was still running when it was deleted, so it would run on over the nap at 9:05 AM–9:20 AM. It can't come back.",
    )
  })

  it("says the other parent restored it already", () => {
    const error = new SleepConflict({ code: "STALE_VERSION", current: { ...NAP, deletedAt: null, updatedBy: EMILY } })
    expect(restoreFailure(error, HOUSEHOLD, { kind: "sleep", sleep: NAP })).toBe("Emily restored this a moment ago.")
  })
})
