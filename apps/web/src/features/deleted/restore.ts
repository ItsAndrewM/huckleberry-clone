import { DiaperConflict, FeedConflict, InvalidInput, MeasurementConflict, Unauthorized } from "@bt/contracts"
import type { Action } from "../../api/actions.ts"
import type { Connectivity } from "../../api/connectivity.ts"
import { AuthRequired, Offline } from "../../api/errors.ts"
import { type Household, nameOf, spanOf, timeOf } from "../../sheets/failure.ts"
import type { DeletedRecord } from "./deleted-rows.ts"

const NOT_RESTORED = "Not restored. Try again."

export const restoreOf = (record: DeletedRecord, actionId: string): Action => {
  switch (record.kind) {
    case "feed":
      return { kind: "restoreFeed", id: record.feed.id, payload: { actionId, version: record.feed.version } }
    case "diaper":
      return { kind: "restoreDiaper", id: record.diaper.id, payload: { actionId, version: record.diaper.version } }
    case "measurement": {
      const { id, version } = record.measurement
      return { kind: "restoreMeasurement", id, payload: { actionId, version } }
    }
  }
}

export const restoreWaitReason = (connectivity: Connectivity): string | null => {
  if (connectivity === "offline") return "Restoring needs a connection."
  return connectivity === "auth-required" ? "Sign in to restore." : null
}

interface Current {
  readonly updatedBy: string
  readonly deletedAt: number | null
}

const staleSentence = (household: Household, { updatedBy, deletedAt }: Current) =>
  `${nameOf(household, updatedBy)} ${deletedAt === null ? "restored" : "changed"} this a moment ago.`

const feedSentence = ({ code, current }: FeedConflict, household: Household): string => {
  switch (code) {
    case "FEED_ALREADY_ACTIVE": {
      const started = `${nameOf(household, current.createdBy)} started a feed at ${timeOf(household, current.startedAt)}.`
      return `${started} Finish it, then restore this one.`
    }
    case "SEGMENT_OVERLAP":
      return `This overlaps the feed at ${spanOf(household, current)}.`
    case "STALE_VERSION":
      return staleSentence(household, current)
    case "FEED_EMPTY":
    case "ACTION_REPLAY_MISMATCH":
      return NOT_RESTORED
  }
}

const conflictSentence = (error: Error, household: Household): string | null => {
  if (error instanceof FeedConflict) return feedSentence(error, household)
  if (!(error instanceof DiaperConflict) && !(error instanceof MeasurementConflict)) return null
  return error.code === "STALE_VERSION" ? staleSentence(household, error.current) : NOT_RESTORED
}

const invalidSentence = ({ fieldErrors }: InvalidInput, { childName }: Household) =>
  fieldErrors.some(({ issue }) => issue === "before_birth") ? `That's before ${childName} was born.` : NOT_RESTORED

export const restoreFailure = (error: Error, household: Household): string => {
  if (error instanceof Offline) return "No connection. Try again once you're back online."
  if (error instanceof AuthRequired || error instanceof Unauthorized) {
    return "Your sign-in has expired. Sign in, then try again."
  }
  if (error instanceof InvalidInput) return invalidSentence(error, household)
  return conflictSentence(error, household) ?? NOT_RESTORED
}
