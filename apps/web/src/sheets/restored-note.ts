import { dayClockTime } from "../clock-time.ts"
import { StaleDraft } from "./drafts.ts"
import type { Household, Note } from "./failure.ts"
import { Unsaved } from "./kept.ts"
import { lostWith, tappedAt, YOUR_CHANGES } from "./lost.ts"
import { isEntry, type Sending } from "./sending.ts"

const dayTimeOf = ({ locale, timeZone }: Household, instant: number) => dayClockTime(instant, timeZone, locale)

const askToSave = (message: string): Note => ({ message, retry: "Save now", signIn: false })

const staleNote = (error: StaleDraft, household: Household) =>
  askToSave(`This wasn't saved before you signed in, ${dayTimeOf(household, error.createdAt)}. Save it now?`)

interface Subject {
  readonly what: string
  readonly many: boolean
  readonly at: number
}

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

const subjectOf = ({ keptAt }: Unsaved, sending: Sending | undefined): Subject => {
  if (sending === undefined || isEntry(sending)) return { what: "This", many: false, at: keptAt }
  const lost = lostWith(sending.action)
  return { what: capitalized(lost), many: lost === YOUR_CHANGES, at: tappedAt(sending.action) ?? keptAt }
}

const unsavedNote = (error: Unsaved, household: Household, sending: Sending | undefined) => {
  const { what, many, at } = subjectOf(error, sending)
  const saved = error.failed ? `${many ? "weren't" : "wasn't"} saved` : "might not have been saved"
  return askToSave(`${what} ${saved}, ${dayTimeOf(household, at)}. Save ${many ? "them" : "it"} now?`)
}

export const restoredNote = (error: Error, household: Household, sending?: Sending): Note | null => {
  if (error instanceof StaleDraft) return staleNote(error, household)
  return error instanceof Unsaved ? unsavedNote(error, household, sending) : null
}
