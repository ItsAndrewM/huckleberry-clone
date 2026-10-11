import {
  type CaregiverName,
  DiaperConflict,
  type Feed,
  FeedConflict,
  type FieldIssue,
  InvalidInput,
  NotFound,
  Unauthorized,
} from "@bt/contracts"
import { AuthRequired, Offline } from "../api/errors.ts"
import { clockTime, dayClockTime } from "../clock-time.ts"
import { StaleDraft } from "./drafts.ts"

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

const fieldNote = (error: InvalidInput, household: Household): Note => {
  const messages = error.fieldErrors.map(({ issue }) => fieldMessage(issue, household))
  return note(messages.find((message) => message !== null) ?? "Check the times and amounts, then try again.")
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

const conflictNote = (error: Error, household: Household): Note | null => {
  if (error instanceof FeedConflict) return feedNote(error, household)
  if (error instanceof DiaperConflict) return diaperNote(error, household)
  return null
}

const dayTimeOf = ({ locale, timeZone }: Household, instant: number) => dayClockTime(instant, timeZone, locale)

const staleNote = (error: StaleDraft, household: Household): Note =>
  note(`This wasn't saved before you signed in, ${dayTimeOf(household, error.createdAt)}. Save it now?`, "Save now")

export const failureNote = (error: Error, household: Household): Note => {
  if (error instanceof Offline)
    return note("No connection. This is kept here: try again once you're back online.", TRY_AGAIN)
  if (error instanceof AuthRequired || error instanceof Unauthorized) {
    return { message: "Your sign-in has expired. Sign in, and this will be saved.", retry: null, signIn: true }
  }
  if (error instanceof StaleDraft) return staleNote(error, household)
  if (error instanceof InvalidInput) return fieldNote(error, household)
  if (error instanceof NotFound) return note("This has changed since it opened. Today is up to date now.")
  return conflictNote(error, household) ?? note("Not saved.", TRY_AGAIN)
}
