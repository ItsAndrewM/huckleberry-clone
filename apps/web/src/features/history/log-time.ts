import type { LocalDate } from "@bt/contracts"
import { localDateOf, localDateTimeOf, resolveLocal, startOfDate } from "@bt/domain"

const wallMsIntoDay = (date: LocalDate, clock: string) =>
  Date.parse(`${date}T${clock}:00Z`) - Date.parse(`${date}T00:00:00Z`)

export const logTimeOn = (date: LocalDate, zone: string, now: number) => {
  if (localDateOf(now, zone) === date) return now
  const clock = localDateTimeOf(now, zone).slice("YYYY-MM-DDT".length)
  const resolution = resolveLocal(`${date}T${clock}`, zone)
  if (resolution.kind === "ok") return resolution.instant
  if (resolution.kind === "ambiguous") return resolution.earlier
  return startOfDate(date, zone) + wallMsIntoDay(date, clock)
}
