import { type Household, timeOf } from "./failure.ts"
import { lostWith, tappedAt } from "./lost.ts"
import type { Sending } from "./sending.ts"

export const discardQuestion = ({ action }: Sending, household: Household | null) => {
  const at = tappedAt(action)
  const when = at === null || household === null ? "" : ` at ${timeOf(household, at)}`
  return `Discard ${lostWith(action)}${when}?`
}
