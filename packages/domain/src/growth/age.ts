import { type LocalDate, utcMidnightOf } from "../time/calendar.ts"
import { DAY_MS } from "../time/instant.ts"

export interface MonthsAndDays {
  readonly months: number
  readonly days: number
}

export const ageInDays = (measuredOn: LocalDate, birthDate: LocalDate): number =>
  (utcMidnightOf(measuredOn) - utcMidnightOf(birthDate)) / DAY_MS

const utcDay = (year: number, monthIndex: number, day: number): number =>
  new Date(0).setUTCFullYear(year, monthIndex, day)

const sameDateMonthsLater = (birth: Date, months: number): number => {
  const year = birth.getUTCFullYear()
  const monthIndex = birth.getUTCMonth() + months
  const daysInMonth = new Date(utcDay(year, monthIndex + 1, 0)).getUTCDate()
  return utcDay(year, monthIndex, Math.min(birth.getUTCDate(), daysInMonth))
}

export const ageInMonthsAndDays = (measuredOn: LocalDate, birthDate: LocalDate): MonthsAndDays | null => {
  const measured = utcMidnightOf(measuredOn)
  const birth = new Date(utcMidnightOf(birthDate))
  if (measured < birth.getTime()) return null
  const on = new Date(measured)
  const calendarMonths = (on.getUTCFullYear() - birth.getUTCFullYear()) * 12 + on.getUTCMonth() - birth.getUTCMonth()
  const months = sameDateMonthsLater(birth, calendarMonths) > measured ? calendarMonths - 1 : calendarMonths
  return { months, days: (measured - sameDateMonthsLater(birth, months)) / DAY_MS }
}
