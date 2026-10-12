import { dayClockTime } from "../clock-time.ts"
import { StaleDraft } from "./drafts.ts"
import type { Household, Note } from "./failure.ts"
import { Unsaved } from "./kept.ts"

const dayTimeOf = ({ locale, timeZone }: Household, instant: number) => dayClockTime(instant, timeZone, locale)

const askToSave = (message: string): Note => ({ message, retry: "Save now", signIn: false })

const staleNote = (error: StaleDraft, household: Household) =>
  askToSave(`This wasn't saved before you signed in, ${dayTimeOf(household, error.createdAt)}. Save it now?`)

const unsavedNote = ({ keptAt, failed }: Unsaved, household: Household) =>
  askToSave(
    `${failed ? "This wasn't saved" : "This might not have been saved"}, ${dayTimeOf(household, keptAt)}. Save it now?`,
  )

export const restoredNote = (error: Error, household: Household): Note | null => {
  if (error instanceof StaleDraft) return staleNote(error, household)
  return error instanceof Unsaved ? unsavedNote(error, household) : null
}
