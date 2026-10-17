import type { LocalDate, Totals, VolumeUnit } from "@bt/contracts"
import { type DatedTotals, type DayAverage, type DayStatus, dayStatus } from "@bt/domain"
import type { TrendsMetric } from "./metrics.ts"
import { dayName } from "./trends-titles.ts"

export interface TrendDay {
  readonly date: LocalDate
  readonly status: DayStatus
  readonly totals: Totals
}

export interface Numbers {
  readonly value: string
  readonly detail: ReadonlyArray<string>
}

export const trendDay = (day: DatedTotals, today: LocalDate, birthDate: LocalDate): TrendDay => ({
  date: day.date,
  totals: day.totals,
  status: dayStatus(day, today, birthDate),
})

export const trendDays = (
  days: ReadonlyArray<DatedTotals>,
  today: LocalDate,
  birthDate: LocalDate,
): ReadonlyArray<TrendDay> => days.map((day) => trendDay(day, today, birthDate))

const overDays = (days: number) => `over ${days} ${days === 1 ? "day" : "days"}`

export const averageNumbers = (
  metric: TrendsMetric,
  average: DayAverage | null,
  volume: VolumeUnit,
  isCurrent: boolean,
): Numbers => {
  if (average === null) return { value: isCurrent ? "No full day logged yet" : "No entries", detail: [] }
  const value = metric.format(metric.total(average.totals), volume)
  return { value: `${value} a day, ${overDays(average.days)}`, detail: metric.detail(average.totals, volume) }
}

export const usualText = (metric: TrendsMetric, usual: DayAverage | null | undefined, volume: VolumeUnit) => {
  if (usual === undefined) return null
  if (usual === null) return "No usual day yet"
  return `Usual ${metric.format(metric.total(usual.totals), volume)}, ${overDays(usual.days)}`
}

export const dayNumbers = (metric: TrendsMetric, day: TrendDay, volume: VolumeUnit): Numbers => {
  if (day.status === "no-entries") return { value: "No entries", detail: [] }
  const value = metric.format(metric.total(day.totals), volume)
  return { value: day.status === "today" ? `${value} so far` : value, detail: metric.detail(day.totals, volume) }
}

export const barAnnouncement = (metric: TrendsMetric, day: TrendDay, volume: VolumeUnit, locale?: string) => {
  const { value, detail } = dayNumbers(metric, day, volume)
  return `${metric.title}, ${dayName(day.date, locale)}: ${[value, ...detail].join(", ")}`
}
