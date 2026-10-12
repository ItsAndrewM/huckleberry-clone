import type { LocalDate } from "@bt/contracts"
import { type Interval, resolveLocal } from "@bt/domain"

const TICK_TIMES = ["06:00", "12:00", "18:00"]

const instantsAt = (date: LocalDate, time: string, zone: string) => {
  const resolved = resolveLocal(`${date}T${time}`, zone)
  if (resolved.kind === "ok") return [resolved.instant]
  return resolved.kind === "ambiguous" ? [resolved.earlier] : []
}

export const dayTicks = (date: LocalDate, bounds: Interval, zone: string) => [
  bounds.start,
  ...TICK_TIMES.flatMap((time) => instantsAt(date, time, zone)),
  bounds.end,
]

export const hourLabel = (zone: string, locale?: string) => {
  const format = new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: zone })
  return (instant: number) => format.format(instant)
}
