import {
  ChildConflict,
  type FieldIssue,
  HouseholdConflict,
  InvalidInput,
  SupplementConflict,
  Unauthorized,
} from "@bt/contracts"
import { AuthRequired, Offline } from "../../api/errors.ts"
import type { ChildFields } from "../../api/settings.ts"

export const saveFailure = (error: Error | null): string | undefined => {
  if (error === null || error instanceof InvalidInput) return undefined
  if (error instanceof Offline) return "Not saved: there's no connection. Try again once you're back online."
  if (error instanceof AuthRequired || error instanceof Unauthorized) return "Not saved. Sign in, then try again."
  if (error instanceof HouseholdConflict || error instanceof ChildConflict || error instanceof SupplementConflict) {
    return "This changed on another phone a moment ago. Check it and try again."
  }
  return "Not saved. Try again."
}

const birthDateMessage = (issue: FieldIssue) => {
  if (issue === "in_future") return "The birth date can't be after today."
  if (issue === "before_birth") return "Some entries are from before this date. Move or delete them first."
  return "Enter the date the baby was born."
}

const FIELD_MESSAGES = {
  name: () => "Enter a name of up to 60 characters.",
  birthDate: birthDateMessage,
  sex: () => "Choose girl or boy.",
  gestationalAgeDays: () => "Enter 22 to 44 weeks and 0 to 6 days.",
} satisfies Record<keyof ChildFields, (issue: FieldIssue) => string>

export const fieldMessage = (error: Error | null, path: keyof ChildFields): string | undefined => {
  if (!(error instanceof InvalidInput)) return undefined
  const fieldError = error.fieldErrors.find((candidate) => candidate.path === path)
  return fieldError === undefined ? undefined : FIELD_MESSAGES[path](fieldError.issue)
}
