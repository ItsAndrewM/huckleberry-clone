import {
  type Deleted,
  DiaperConflict,
  DoseConflict,
  FeedConflict,
  InvalidInput,
  MeasurementConflict,
  SleepConflict,
  Unauthorized,
} from "@bt/contracts"
import type { Action } from "../../api/actions.ts"
import type { Connectivity } from "../../api/connectivity.ts"
import { AuthRequired, Offline } from "../../api/errors.ts"
import { type Household, nameOf, spanOf, timeOf } from "../../sheets/failure.ts"
import { runningSide } from "../today/feed-status.ts"
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
    case "sleep":
      return { kind: "restoreSleep", id: record.sleep.id, payload: { actionId, version: record.sleep.version } }
    case "dose":
      return { kind: "restoreDose", id: record.dose.id, payload: { actionId, version: record.dose.version } }
  }
}

export const withoutEntry = (deleted: Deleted, id: string): Deleted => ({
  feeds: deleted.feeds.filter((feed) => feed.id !== id),
  diapers: deleted.diapers.filter((diaper) => diaper.id !== id),
  sleeps: deleted.sleeps.filter((sleep) => sleep.id !== id),
  measurements: deleted.measurements.filter((measurement) => measurement.id !== id),
  doses: deleted.doses.filter((dose) => dose.id !== id),
})

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

const stillRunning = (record: DeletedRecord) =>
  (record.kind === "feed" && runningSide(record.feed) !== undefined) ||
  (record.kind === "sleep" && record.sleep.endedAt === null)

const runningOver = (other: string) =>
  `It was still running when it was deleted, so it would run on over ${other}. It can't come back.`

const feedSentence = ({ code, current }: FeedConflict, household: Household, running: boolean): string => {
  switch (code) {
    case "FEED_ALREADY_ACTIVE": {
      const name = nameOf(household, current.createdBy)
      const time = timeOf(household, current.startedAt)
      if (running) return runningOver(`the feed ${name} started at ${time}`)
      return `${name} started a feed at ${time}. Finish it, then restore this one.`
    }
    case "SEGMENT_OVERLAP": {
      const other = `the feed at ${spanOf(household, current)}`
      return running ? runningOver(other) : `This overlaps ${other}.`
    }
    case "STALE_VERSION":
      return staleSentence(household, current)
    case "FEED_EMPTY":
    case "ACTION_REPLAY_MISMATCH":
      return NOT_RESTORED
  }
}

const sleepSentence = ({ code, current }: SleepConflict, household: Household, running: boolean): string => {
  switch (code) {
    case "SLEEP_ALREADY_ACTIVE":
      return runningOver(
        `the sleep ${nameOf(household, current.createdBy)} started at ${timeOf(household, current.startedAt)}`,
      )
    case "SLEEP_OVERLAP": {
      const other = `the ${current.kind} at ${spanOf(household, current)}`
      return running ? runningOver(other) : `This overlaps ${other}.`
    }
    case "STALE_VERSION":
      return staleSentence(household, current)
    case "ACTION_REPLAY_MISMATCH":
      return NOT_RESTORED
  }
}

const conflictSentence = (error: Error, household: Household, record: DeletedRecord): string | null => {
  if (error instanceof SleepConflict) return sleepSentence(error, household, stillRunning(record))
  if (error instanceof FeedConflict) return feedSentence(error, household, stillRunning(record))
  if (!(error instanceof DiaperConflict || error instanceof MeasurementConflict || error instanceof DoseConflict)) {
    return null
  }
  return error.code === "STALE_VERSION" ? staleSentence(household, error.current) : NOT_RESTORED
}

const invalidSentence = ({ fieldErrors }: InvalidInput, { childName }: Household) =>
  fieldErrors.some(({ issue }) => issue === "before_birth") ? `That's before ${childName} was born.` : NOT_RESTORED

export const restoreFailure = (error: Error, household: Household, record: DeletedRecord): string => {
  if (error instanceof Offline) return "No connection. Try again once you're back online."
  if (error instanceof AuthRequired || error instanceof Unauthorized) {
    return "Your sign-in has expired. Sign in, then try again."
  }
  if (error instanceof InvalidInput) return invalidSentence(error, household)
  return conflictSentence(error, household, record) ?? NOT_RESTORED
}
