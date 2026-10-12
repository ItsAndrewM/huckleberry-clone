import {
  DiaperConflict,
  FeedConflict,
  InvalidInput,
  MeasurementConflict,
  NotFound,
  ServiceUnavailable,
  Unauthorized,
} from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline } from "../src/api/errors.ts"
import { restoreFailure, restoreOf, restoreWaitReason } from "../src/features/deleted/restore.ts"
import type { Household } from "../src/sheets/failure.ts"
import { measurement } from "./growth-fixtures.ts"
import { ANDREW, diaperAt, EMILY, feedAt, MINUTE, NOW, nursedFor, ZONE } from "./today-fixtures.ts"

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

const failure = (error: Error) => restoreFailure(error, HOUSEHOLD).replace(/\s/gu, " ")

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

  it("names the running feed that stops a running one coming back, and what to do", () => {
    const running = feedAt(NOW - 25 * MINUTE, { status: "active", endedAt: null, createdBy: EMILY })
    expect(failure(new FeedConflict({ code: "FEED_ALREADY_ACTIVE", current: running }))).toBe(
      "Emily started a feed at 9:05 AM. Finish it, then restore this one.",
    )
  })

  it("names the feed a restored one would overlap", () => {
    const other = nursedFor(feedAt(NOW - 40 * MINUTE), "left", 15)
    expect(failure(new FeedConflict({ code: "SEGMENT_OVERLAP", current: other }))).toBe(
      "This overlaps the feed at 8:50 AM–9:05 AM.",
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
