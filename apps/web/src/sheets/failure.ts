import {
  type CaregiverName,
  DiaperConflict,
  type Feed,
  FeedConflict,
  type FieldIssue,
  InvalidInput,
  MeasurementConflict,
  NotFound,
  Unauthorized,
} from "@bt/contracts"
import { AuthRequired, Offline } from "../api/errors.ts"
import { clockTime } from "../clock-time.ts"
import { restoredNote } from "./restored-note.ts"
import type { SheetKind } from "./sending.ts"

export interface Note {
  readonly message: string
  readonly retry: string | null
  readonly signIn: boolean
}

export interface Household {
  readonly caregivers: ReadonlyArray<CaregiverName>
  readonly timeZone: string
  readonly childName: string
  readonly locale?: string
}

const TRY_AGAIN = "Try again"

const note = (message: string, retry: string | null = null): Note => ({ message, retry, signIn: false })

const nameOf = ({ caregivers }: Household, id: string) =>
  caregivers.find((caregiver) => caregiver.id === id)?.displayName ?? "The other phone"

const timeOf = ({ locale, timeZone }: Household, instant: number) => clockTime(instant, timeZone, locale)

const spanOf = (household: Household, feed: Feed) =>
  `${timeOf(household, feed.startedAt)}–${feed.endedAt === null ? "now" : timeOf(household, feed.endedAt)}`

const fieldMessage = (issue: FieldIssue, household: Household): string | null => {
  switch (issue) {
    case "in_future":
      return "That time is in the future."
    case "before_birth":
      return `That's before ${household.childName} was born.`
    case "end_not_after_start":
      return "Pick a time after this side started."
    case "out_of_range":
      return "A side can run for 4 hours at most."
    default:
      return null
  }
}

const METRICS = new Set(["weightG", "lengthCm", "headCm"])

const fieldNote = (error: InvalidInput, household: Household): Note => {
  const messages = error.fieldErrors.map(({ issue }) => fieldMessage(issue, household))
  const measured = error.fieldErrors.some(({ path }) => METRICS.has(path))
  const otherwise = measured
    ? "Check the measurements, then try again."
    : "Check the times and amounts, then try again."
  return note(messages.find((message) => message !== null) ?? otherwise)
}

const feedNote = (error: FeedConflict, household: Household): Note => {
  const { current } = error
  switch (error.code) {
    case "FEED_ALREADY_ACTIVE":
      return note(`${nameOf(household, current.createdBy)} started a feed at ${timeOf(household, current.startedAt)}.`)
    case "SEGMENT_OVERLAP":
      return note(`This overlaps the feed at ${spanOf(household, current)}.`)
    case "STALE_VERSION":
      return note(`${nameOf(household, current.updatedBy)} changed this feed a moment ago.`)
    case "FEED_EMPTY":
      return note("Nothing would be left in this feed.")
    case "ACTION_REPLAY_MISMATCH":
      return note("This was already saved as you first entered it.")
  }
}

const diaperNote = (error: DiaperConflict, household: Household): Note =>
  error.code === "STALE_VERSION"
    ? note(`${nameOf(household, error.current.updatedBy)} changed this diaper a moment ago.`)
    : note("This was already saved as you first entered it.")

const measurementNote = ({ code, current }: MeasurementConflict, household: Household): Note => {
  if (code === "ACTION_REPLAY_MISMATCH") return note("This was already saved as you first entered it.")
  const changed = current.deletedAt === null ? "changed" : "deleted"
  return note(`${nameOf(household, current.updatedBy)} ${changed} this measurement a moment ago.`)
}

const conflictNote = (error: Error, household: Household): Note | null => {
  if (error instanceof FeedConflict) return feedNote(error, household)
  if (error instanceof DiaperConflict) return diaperNote(error, household)
  if (error instanceof MeasurementConflict) return measurementNote(error, household)
  return null
}

const GONE = "This has changed since it opened. Today is up to date now."

const MEASUREMENT_GONE = "This measurement has changed since it opened. Growth is up to date now."

export type KeptOn = "phone" | "app" | null

export interface NoteOptions {
  readonly keptOn: KeptOn
  readonly sheet?: SheetKind
}

const OFFLINE = {
  phone: "No connection. This is kept on this phone: try again once you're back online.",
  app: "No connection. Keep the app open, and try again once you're back online.",
}

const offlineNote = (keptOn: KeptOn): Note =>
  note(keptOn === null ? "No connection. Try again once you're back online." : OFFLINE[keptOn], TRY_AGAIN)

const goneNote = (sheet: SheetKind | undefined): Note => note(sheet === "measurement" ? MEASUREMENT_GONE : GONE)

export const failureNote = (error: Error, household: Household, { keptOn, sheet }: NoteOptions): Note => {
  if (error instanceof Offline) return offlineNote(keptOn)
  if (error instanceof AuthRequired || error instanceof Unauthorized) {
    return { message: "Your sign-in has expired. Sign in, and this will be saved.", retry: null, signIn: true }
  }
  const restored = restoredNote(error, household)
  if (restored !== null) return restored
  if (error instanceof InvalidInput) return fieldNote(error, household)
  if (error instanceof NotFound) return goneNote(sheet)
  return conflictNote(error, household) ?? note("Not saved.", TRY_AGAIN)
}
