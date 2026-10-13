import type { IsoWeek, LocalDate } from "@bt/contracts"
import { addDaysToDate, averageDay, type DatedTotals, type DayAverage, isoWeekOfDate } from "@bt/domain"

const DAYS_BEFORE = 7

export const usualWeeks = (date: LocalDate): readonly [IsoWeek, IsoWeek] => [
  isoWeekOfDate(addDaysToDate(date, -DAYS_BEFORE)),
  isoWeekOfDate(addDaysToDate(date, -1)),
]

export const usualDay = (
  weeks: ReadonlyArray<ReadonlyArray<DatedTotals> | undefined>,
  date: LocalDate,
  today: LocalDate,
  birthDate: LocalDate,
): DayAverage | null | undefined => {
  const loaded = weeks.flatMap((days) => (days === undefined ? [] : [days]))
  if (loaded.length < weeks.length) return undefined
  const earliest = addDaysToDate(date, -DAYS_BEFORE)
  const before = loaded.flat().filter((day) => day.date >= earliest && day.date < date)
  const once = new Map(before.map((day) => [day.date, day] as const))
  return averageDay([...once.values()], today, birthDate)
}
