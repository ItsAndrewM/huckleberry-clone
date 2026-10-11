import { DiaperConflict, FeedConflict } from "@bt/contracts"
import { joined, redone } from "./redo.ts"
import { bottleEdit, diaperEdit } from "./save-changes.ts"
import type { Failed, Recovery, Sending } from "./sending.ts"

const SETTLED_BY_OK = new Set(["STALE_VERSION", "FEED_ALREADY_ACTIVE", "ACTION_REPLAY_MISMATCH"])

const CANT_SAVE_AS_IS = new Set(["ACTION_REPLAY_MISMATCH", "FEED_ALREADY_ACTIVE"])

const feedRecovery = (sending: Sending, error: FeedConflict): Recovery | null => {
  switch (error.code) {
    case "STALE_VERSION":
      return redone(sending, error.current)
    case "FEED_ALREADY_ACTIVE":
      return joined(sending, error.current)
    case "ACTION_REPLAY_MISMATCH":
      return bottleEdit(sending, error.current)
    default:
      return null
  }
}

export const recoveryOf = ({ sending, error }: Failed): Recovery | null => {
  if (error instanceof FeedConflict) return feedRecovery(sending, error)
  if (error instanceof DiaperConflict && error.code === "ACTION_REPLAY_MISMATCH")
    return diaperEdit(sending, error.current)
  return null
}

export const offersOk = (error: Error) =>
  (error instanceof FeedConflict || error instanceof DiaperConflict) && SETTLED_BY_OK.has(error.code)

export const settlesWithoutAsking = (error: Error) => "code" in error && CANT_SAVE_AS_IS.has(String(error.code))
