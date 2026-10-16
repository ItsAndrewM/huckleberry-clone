import { DiaperConflict, FeedConflict, MeasurementConflict, SleepConflict } from "@bt/contracts"
import { isConflict } from "./held.ts"
import { joined, mineAnyway, redone, redoneSleep } from "./redo.ts"
import { diaperEdit, feedReplay, measurementReplay, sleepReplay } from "./save-changes.ts"
import { type Failed, isEntry, type Recovery, type Sending } from "./sending.ts"

const SETTLED_BY_OK = new Set([
  "STALE_VERSION",
  "FEED_ALREADY_ACTIVE",
  "SLEEP_ALREADY_ACTIVE",
  "ACTION_REPLAY_MISMATCH",
])

export const redoOf = ({ sending, error }: Failed): Recovery | null => {
  if (error instanceof SleepConflict && error.code === "STALE_VERSION") return redoneSleep(sending, error.current)
  if (error instanceof FeedConflict && error.code === "STALE_VERSION") return redone(sending, error.current)
  if (error instanceof MeasurementConflict && error.code !== "ACTION_REPLAY_MISMATCH")
    return mineAnyway(sending, error.current)
  return null
}

const feedRecovery = (sending: Sending, error: FeedConflict): Recovery | null => {
  if (error.code === "FEED_ALREADY_ACTIVE") return joined(sending, error.current)
  return error.code === "ACTION_REPLAY_MISMATCH" ? feedReplay(sending, error.current) : null
}

const replayOf = ({ sending, error }: Failed): Recovery | null => {
  if (error instanceof SleepConflict && error.code === "ACTION_REPLAY_MISMATCH")
    return sleepReplay(sending, error.current)
  if (error instanceof FeedConflict) return feedRecovery(sending, error)
  if (error instanceof MeasurementConflict && error.code === "ACTION_REPLAY_MISMATCH")
    return measurementReplay(sending, error.current)
  if (error instanceof DiaperConflict && error.code === "ACTION_REPLAY_MISMATCH")
    return diaperEdit(sending, error.current)
  return null
}

export const recoveryOf = (failed: Failed): Recovery | null => redoOf(failed) ?? replayOf(failed)

export const offersOk = ({ sending, error }: Failed) =>
  isConflict(error) &&
  "code" in error &&
  SETTLED_BY_OK.has(String(error.code)) &&
  !(error.code === "STALE_VERSION" && isEntry(sending))
