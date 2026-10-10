import { ChildConflict, HouseholdConflict, InvalidInput, Unauthorized } from "@bt/contracts"
import { AuthRequired, Offline } from "../../api/errors.ts"

export const saveFailure = (error: Error | null): string | undefined => {
  if (error === null || error instanceof InvalidInput) return undefined
  if (error instanceof Offline) return "Not saved: there's no connection. Try again once you're back online."
  if (error instanceof AuthRequired || error instanceof Unauthorized) return "Not saved. Sign in, then try again."
  if (error instanceof HouseholdConflict || error instanceof ChildConflict) {
    return "This changed on another phone a moment ago. Check it and try again."
  }
  return "Not saved. Try again."
}
