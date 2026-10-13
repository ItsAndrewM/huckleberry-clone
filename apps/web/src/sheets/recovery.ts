import { DiaperConflict, FeedConflict, MeasurementConflict, SleepConflict } from "@bt/contracts"
import { joined, mineAnyway, redone, redoneSleep } from "./redo.ts"
import { diaperEdit, feedReplay, measurementReplay, sleepReplay } from "./save-changes.ts"
import type { Failed, Recovery, Sending } from "./sending.ts"
import { isEntry } from "./sheets-state.ts"

const SETTLED_BY_OK = new Set([
  "STALE_VERSION",
  "FEED_ALREADY_ACTIVE",
  "SLEEP_ALREADY_ACTIVE",
  "ACTION_REPLAY_MISMATCH",
])

const feedRecovery = (sending: Sending, error: FeedConflict): Recovery | null => {
  switch (error.code) {
    case "STALE_VERSION":
      return redone(sending, error.current)
    case "FEED_ALREADY_ACTIVE":
      return joined(sending, error.current)
    case "ACTION_REPLAY_MISMATCH":
      return feedReplay(sending, error.current)
    default:
      return null
  }
}

const measurementRecovery = (sending: Sending, { code, current }: MeasurementConflict): Recovery | null =>
  code === "ACTION_REPLAY_MISMATCH" ? measurementReplay(sending, current) : mineAnyway(sending, current)

const sleepRecovery = (sending: Sending, { code, current }: SleepConflict): Recovery | null => {
  if (code === "STALE_VERSION") return redoneSleep(sending, current)
  return code === "ACTION_REPLAY_MISMATCH" ? sleepReplay(sending, current) : null
}

export const recoveryOf = ({ sending, error }: Failed): Recovery | null => {
  if (error instanceof SleepConflict) return sleepRecovery(sending, error)
  if (error instanceof FeedConflict) return feedRecovery(sending, error)
  if (error instanceof MeasurementConflict) return measurementRecovery(sending, error)
  if (error instanceof DiaperConflict && error.code === "ACTION_REPLAY_MISMATCH")
    return diaperEdit(sending, error.current)
  return null
}

const isConflict = (error: Error) =>
  error instanceof FeedConflict ||
  error instanceof DiaperConflict ||
  error instanceof MeasurementConflict ||
  error instanceof SleepConflict

export const offersOk = ({ sending, error }: Failed) =>
  isConflict(error) &&
  "code" in error &&
  SETTLED_BY_OK.has(String(error.code)) &&
  !(error.code === "STALE_VERSION" && isEntry(sending))
