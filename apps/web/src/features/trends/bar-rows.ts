import type { LocalDate, VolumeUnit } from "@bt/contracts"
import type { DayStatus } from "@bt/domain"
import type { TrendsMetric } from "./metrics.ts"
import type { TrendDay } from "./trends-numbers.ts"

export interface BarRow {
  readonly key: string
  readonly date: LocalDate
  readonly value: number
  readonly fill: string
  readonly soFar: boolean
}

export interface DayTarget {
  readonly date: LocalDate
}

const PART_SHADES = [100, 45] as const
const SO_FAR = 0.55
const FADED = 0.3

const DRAWN: ReadonlySet<DayStatus> = new Set(["counted", "today"])
const PICKABLE: ReadonlySet<DayStatus> = new Set(["counted", "no-entries", "today"])

export const dayTargets = (days: ReadonlyArray<TrendDay>): ReadonlyArray<DayTarget> =>
  days.flatMap(({ date, status }) => (PICKABLE.has(status) ? [{ date }] : []))

const shade = (percent: number) =>
  percent >= 100 ? "var(--primary)" : `color-mix(in oklab, var(--primary) ${Math.round(percent)}%, var(--background))`

const fillOf = (part: number, day: TrendDay, picked: LocalDate | null) => {
  const base = PART_SHADES[part] ?? PART_SHADES[1]
  if (picked !== null && picked !== day.date) return shade(base * FADED)
  return shade(day.status === "today" ? base * SO_FAR : base)
}

export const barRows = (
  metric: TrendsMetric,
  days: ReadonlyArray<TrendDay>,
  volume: VolumeUnit,
  picked: LocalDate | null,
): ReadonlyArray<BarRow> =>
  days.flatMap((day) =>
    DRAWN.has(day.status)
      ? metric.parts.flatMap((part, index) => {
          const value = metric.plotted(part.amount(day.totals), volume)
          const row = {
            key: `${day.date}:${part.key}`,
            date: day.date,
            value,
            fill: fillOf(index, day, picked),
            soFar: day.status === "today",
          }
          return value > 0 ? [row] : []
        })
      : [],
  )

export const tallestDay = (rows: ReadonlyArray<BarRow>) => {
  const byDate = new Map<LocalDate, number>()
  for (const { date, value } of rows) byDate.set(date, (byDate.get(date) ?? 0) + value)
  return Math.max(0, ...byDate.values())
}
