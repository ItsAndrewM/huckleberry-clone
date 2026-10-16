import {
  type CaregiverName,
  DiaperConflict,
  DoseConflict,
  FeedConflict,
  type FieldIssue,
  InvalidInput,
  MeasurementConflict,
  NotFound,
  type Sleep,
  SleepConflict,
  Unauthorized,
} from "@bt/contracts"
import type { Action } from "../api/actions.ts"
import { AuthRequired, Offline } from "../api/errors.ts"
import { clockTime } from "../clock-time.ts"
import { offersRetry } from "./held.ts"
import { restoredNote } from "./restored-note.ts"
import { editsARecord, type Sending, type SheetKind } from "./sending.ts"

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

const note = (message: string): Note => ({ message, retry: null, signIn: false })

export const nameOf = ({ caregivers }: Household, id: string) =>
  caregivers.find((caregiver) => caregiver.id === id)?.displayName ?? "The other phone"

export const timeOf = ({ locale, timeZone }: Household, instant: number) => clockTime(instant, timeZone, locale)

interface Spanned {
  readonly startedAt: number
  readonly endedAt: number | null
}

export const spanOf = (household: Household, { startedAt, endedAt }: Spanned) =>
  `${timeOf(household, startedAt)}–${endedAt === null ? "now" : timeOf(household, endedAt)}`

const SLEEP_SHEETS = new Set<SheetKind | undefined>(["sleep", "pastSleep", "editSleep"])

const fieldMessage = (issue: FieldIssue, household: Household, sleeping: boolean): string | null => {
  switch (issue) {
    case "in_future":
      return "That time is in the future."
    case "before_birth":
      return `That's before ${household.childName} was born.`
    case "end_not_after_start":
      return sleeping ? "Pick a time after she fell asleep." : "Pick a time after this side started."
    case "out_of_range":
      return sleeping ? "A sleep can last a day at most." : "A side can run for 4 hours at most."
    default:
      return null
  }
}

const METRICS = new Set(["weightG", "lengthCm", "headCm"])

const fieldFallback = (measured: boolean, sleeping: boolean) => {
  if (measured) return "Check the measurements, then try again."
  return sleeping ? "Check the times, then try again." : "Check the times and amounts, then try again."
}

const fieldNote = (error: InvalidInput, household: Household, sheet: SheetKind | undefined): Note => {
  const sleeping = SLEEP_SHEETS.has(sheet)
  const messages = error.fieldErrors.map(({ issue }) => fieldMessage(issue, household, sleeping))
  const measured = error.fieldErrors.some(({ path }) => METRICS.has(path))
  return note(messages.find((message) => message !== null) ?? fieldFallback(measured, sleeping))
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

const doseNote = ({ code, current }: DoseConflict, household: Household): Note => {
  if (code === "ACTION_REPLAY_MISMATCH") return note("This was already saved as you first entered it.")
  if (code === "SUPPLEMENT_DUPLICATE_DAY") {
    return note(
      `This was already logged at ${timeOf(household, current.occurredAt)} by ${nameOf(household, current.createdBy)}.`,
    )
  }
  const changed = current.deletedAt === null ? "changed" : "deleted"
  return note(`${nameOf(household, current.updatedBy)} ${changed} this dose a moment ago.`)
}

const staleSleepSentence = (current: Sleep, household: Household, action?: Action["kind"]) => {
  const name = nameOf(household, current.updatedBy)
  if (current.deletedAt !== null) return `${name} deleted this sleep a moment ago.`
  if (action !== "wakeSleep" || current.endedAt === null) return `${name} changed this sleep a moment ago.`
  return `${name} woke her at ${timeOf(household, current.endedAt)}.`
}

const sleepNote = ({ code, current }: SleepConflict, household: Household, action?: Action["kind"]): Note => {
  switch (code) {
    case "SLEEP_ALREADY_ACTIVE":
      return note(`${nameOf(household, current.createdBy)} started a sleep at ${timeOf(household, current.startedAt)}.`)
    case "SLEEP_OVERLAP":
      return note(`This overlaps the ${current.kind} at ${spanOf(household, current)}.`)
    case "STALE_VERSION":
      return note(staleSleepSentence(current, household, action))
    case "ACTION_REPLAY_MISMATCH":
      return note("This was already saved as you first entered it.")
  }
}

const conflictNote = (error: Error, household: Household, action?: Action["kind"]): Note | null => {
  if (error instanceof SleepConflict) return sleepNote(error, household, action)
  if (error instanceof FeedConflict) return feedNote(error, household)
  if (error instanceof DiaperConflict) return diaperNote(error, household)
  if (error instanceof MeasurementConflict) return measurementNote(error, household)
  if (error instanceof DoseConflict) return doseNote(error, household)
  return null
}

const GONE = "This has changed since it opened. Today is up to date now."

const MEASUREMENT_GONE = "This measurement has changed since it opened. Growth is up to date now."

export type KeptOn = "phone" | "app"

export interface NoteOptions {
  readonly keptOn: KeptOn
  readonly sheet?: SheetKind
  readonly sending?: Sending
}

const OFFLINE = {
  phone: "No connection. This is kept on this phone: try again once you're back online.",
  app: "No connection. Keep the app open, and try again once you're back online.",
}

const offlineNote = (keptOn: KeptOn): Note => note(OFFLINE[keptOn])

const EDITED_GONE = "This was deleted since it opened."

const goneMessage = (sheet: SheetKind | undefined) => {
  if (sheet === "measurement") return MEASUREMENT_GONE
  return sheet !== undefined && editsARecord(sheet) ? EDITED_GONE : GONE
}

const goneNote = (sheet: SheetKind | undefined): Note => note(goneMessage(sheet))

const noteFor = (error: Error, household: Household, { keptOn, sheet, sending }: NoteOptions): Note => {
  if (error instanceof Offline) return offlineNote(keptOn)
  if (error instanceof AuthRequired || error instanceof Unauthorized) {
    return { message: "Your sign-in has expired. Sign in, and this will be saved.", retry: null, signIn: true }
  }
  const restored = restoredNote(error, household, sending)
  if (restored !== null) return restored
  if (error instanceof InvalidInput) return fieldNote(error, household, sheet)
  if (error instanceof NotFound) return goneNote(sheet)
  return conflictNote(error, household, sending?.action.kind) ?? note("Not saved.")
}

export const failureNote = (error: Error, household: Household, options: NoteOptions): Note => {
  const said = noteFor(error, household, options)
  return said.retry === null && offersRetry(error) ? { ...said, retry: TRY_AGAIN } : said
}
