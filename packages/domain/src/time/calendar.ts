import { DAY_MS } from "./instant.ts"

export type LocalDate = string
export type IsoWeek = string
export type YearMonth = string

const WEEK_MS = 7 * DAY_MS
const MONDAY_TO_THURSDAY = 3

export const utcDateOf = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10)

const LOCAL_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/
const ISO_WEEK_FORMAT = /^(\d{4})-W(\d{2})$/

const midnightOf = (date: string): number | null => {
  const ms = Date.parse(`${date}T00:00:00Z`)
  return LOCAL_DATE_FORMAT.test(date) && Number.isFinite(ms) && utcDateOf(ms) === date ? ms : null
}

export const isLocalDate = (value: string): boolean => midnightOf(value) !== null

export const isYearMonth = (value: string): boolean => isLocalDate(`${value}-01`)

export const utcMidnightOf = (date: LocalDate): number => {
  const ms = midnightOf(date)
  if (ms === null) throw new RangeError(`Expected a date like 2026-10-06, got "${date}"`)
  return ms
}

export const addDaysToDate = (date: LocalDate, days: number): LocalDate =>
  utcDateOf(utcMidnightOf(date) + days * DAY_MS)

export const datesBetween = (first: LocalDate, last: LocalDate): LocalDate[] => {
  const dates: LocalDate[] = []
  const end = utcMidnightOf(last)
  for (let ms = utcMidnightOf(first); ms <= end; ms += DAY_MS) dates.push(utcDateOf(ms))
  return dates
}

export const monthOfDate = (date: LocalDate): YearMonth => utcDateOf(utcMidnightOf(date)).slice(0, 7)

export const nextMonth = (month: YearMonth): YearMonth => {
  const first = new Date(utcMidnightOf(`${month}-01`))
  return monthOfDate(utcDateOf(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)))
}

const daysSinceMonday = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7

export const isoWeekOfDate = (date: LocalDate): IsoWeek => {
  const midnight = utcMidnightOf(date)
  const thursday = midnight + (MONDAY_TO_THURSDAY - daysSinceMonday(midnight)) * DAY_MS
  const year = new Date(thursday).getUTCFullYear()
  const week = Math.floor((thursday - new Date(0).setUTCFullYear(year, 0, 1)) / WEEK_MS) + 1
  return `${year}-W${String(week).padStart(2, "0")}`
}

const mondayOf = (week: string): LocalDate | null => {
  const [, year, weekNumber] = ISO_WEEK_FORMAT.exec(week) ?? []
  if (weekNumber === undefined) return null
  const fourthOfJanuary = new Date(0).setUTCFullYear(Number(year), 0, 4)
  const firstMonday = fourthOfJanuary - daysSinceMonday(fourthOfJanuary) * DAY_MS
  const monday = utcDateOf(firstMonday + (Number(weekNumber) - 1) * WEEK_MS)
  return isLocalDate(monday) && isoWeekOfDate(monday) === week ? monday : null
}

export const isIsoWeek = (value: string): boolean => mondayOf(value) !== null

export const isoWeekMonday = (week: IsoWeek): LocalDate => {
  const monday = mondayOf(week)
  if (monday === null) throw new RangeError(`Expected an ISO week like 2026-W41, got "${week}"`)
  return monday
}

export const isoWeekDates = (week: IsoWeek): LocalDate[] => {
  const monday = isoWeekMonday(week)
  return datesBetween(monday, addDaysToDate(monday, 6))
}

export const monthDates = (month: YearMonth): LocalDate[] =>
  datesBetween(`${month}-01`, addDaysToDate(`${nextMonth(month)}-01`, -1))
