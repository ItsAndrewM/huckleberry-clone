import { type LocalDate, utcMidnightOf } from "../time/calendar.ts"
import { DAY_MS } from "../time/instant.ts"

export const ageInDays = (measuredOn: LocalDate, birthDate: LocalDate): number =>
  (utcMidnightOf(measuredOn) - utcMidnightOf(birthDate)) / DAY_MS
