import { DiaperConflict, FeedConflict, InvalidInput, NotFound, SleepConflict, Unauthorized } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline } from "../src/api/errors.ts"
import { recordOf } from "../src/api/today-change.ts"
import { staleOf } from "../src/features/edit/stale.ts"
import { offersRetry } from "../src/sheets/held.ts"
import { recoveryOf } from "../src/sheets/recovery.ts"
import { stillSaveable } from "../src/sheets/saveable.ts"
import { editsARecord, type Failed, type Sending } from "../src/sheets/sending.ts"
import { diaperAt, feedAt, NOW, sleptAt } from "./today-fixtures.ts"

const ACTION_ID = "4b1c2a5e-8f3d-4c6b-9a7e-2d1f0e3c5b6a"
const TAPPED = NOW - 60_000

const PAUSE: Sending = {
  sheet: "nursing",
  action: { kind: "pauseFeed", id: "feed-1", payload: { actionId: ACTION_ID, version: 3, occurredAt: TAPPED } },
}

const WAKE: Sending = {
  sheet: "sleep",
  action: { kind: "wakeSleep", id: "sleep-1", payload: { actionId: ACTION_ID, version: 1, occurredAt: TAPPED } },
}

const DIAPER_EDIT: Sending = {
  sheet: "editDiaper",
  action: {
    kind: "editDiaper",
    id: "diaper-1",
    payload: { actionId: ACTION_ID, version: 2, occurredAt: TAPPED, wet: false, dirty: true },
  },
}

const RUNNING = feedAt(NOW - 600_000, {
  id: "feed-1",
  status: "active",
  endedAt: null,
  version: 4,
  segments: [{ id: "segment-1", side: "left", startedAt: NOW - 600_000, endedAt: null }],
})
const FINISHED = feedAt(NOW - 600_000, { id: "feed-1", status: "completed", version: 4 })
const ASLEEP = sleptAt(NOW - 3_600_000, { id: "sleep-1", endedAt: null, version: 2 })
const WOKEN = sleptAt(NOW - 3_600_000, { id: "sleep-1", endedAt: NOW - 30_000, version: 2 })

const CASES: ReadonlyArray<readonly [string, Failed, boolean]> = [
  ["a pause with no connection", { sending: PAUSE, error: new Offline() }, true],
  ["a pause not saved for another reason", { sending: PAUSE, error: new Error("Not saved") }, true],
  ["a pause waiting on a sign-in", { sending: PAUSE, error: new AuthRequired() }, true],
  ["a pause after a refused sign-in", { sending: PAUSE, error: new Unauthorized() }, true],
  [
    "a pause the other change still fits, which Pause anyway saves",
    { sending: PAUSE, error: new FeedConflict({ code: "STALE_VERSION", current: RUNNING }) },
    true,
  ],
  [
    "a pause on a feed finished meanwhile, which nothing would save",
    { sending: PAUSE, error: new FeedConflict({ code: "STALE_VERSION", current: FINISHED }) },
    false,
  ],
  [
    "a wake on a sleep still running, which Wake anyway saves",
    { sending: WAKE, error: new SleepConflict({ code: "STALE_VERSION", current: ASLEEP }) },
    true,
  ],
  [
    "a wake on a sleep already woken",
    { sending: WAKE, error: new SleepConflict({ code: "STALE_VERSION", current: WOKEN }) },
    false,
  ],
  [
    "an edit sheet's change after the other phone's, which Save mine anyway saves",
    {
      sending: DIAPER_EDIT,
      error: new DiaperConflict({ code: "STALE_VERSION", current: diaperAt(NOW, { id: "diaper-1", version: 3 }) }),
    },
    true,
  ],
  [
    "an edit sheet's change to a diaper deleted meanwhile",
    {
      sending: DIAPER_EDIT,
      error: new DiaperConflict({
        code: "STALE_VERSION",
        current: diaperAt(NOW, { id: "diaper-1", version: 3, deletedAt: NOW }),
      }),
    },
    false,
  ],
  [
    "a time the household refused",
    { sending: PAUSE, error: new InvalidInput({ fieldErrors: [{ path: "occurredAt", issue: "in_future" }] }) },
    false,
  ],
  ["a record that's gone", { sending: PAUSE, error: new NotFound() }, false],
]

const offeredOnTheSheet = (failed: Failed) => {
  if (offersRetry(failed.error) || failed.error instanceof AuthRequired || failed.error instanceof Unauthorized) {
    return true
  }
  if (editsARecord(failed.sending.sheet)) {
    const stale = staleOf(failed)
    return stale !== null && recordOf(stale.current).deletedAt === null
  }
  return recoveryOf(failed)?.label.endsWith("anyway") ?? false
}

describe("stillSaveable", () => {
  it.each(CASES)("knows whether it could still be saved: %s", (_label, failed, saveable) => {
    expect(stillSaveable(failed)).toBe(saveable)
  })

  it.each(CASES)("agrees with what the sheet offers to save it with: %s", (_label, failed) => {
    expect(stillSaveable(failed)).toBe(offeredOnTheSheet(failed))
  })
})
