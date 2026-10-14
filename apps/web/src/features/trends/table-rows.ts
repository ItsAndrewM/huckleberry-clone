import type { LocalDate, VolumeUnit } from "@bt/contracts"
import type { DayStatus } from "@bt/domain"
import { TRENDS_METRICS } from "./metrics.ts"
import type { TrendDay } from "./trends-numbers.ts"
import { dayName } from "./trends-titles.ts"

export interface TableRow {
  readonly date: LocalDate
  readonly name: string
  readonly cells: ReadonlyArray<string>
}

const SHOWN: ReadonlySet<DayStatus> = new Set(["counted", "no-entries", "today"])

const UNIT_THEN_NUMBER = /(\p{L})\s+(\p{N})/gu
const PART_BREAK = "\n"

export const valueParts = (value: string) => value.replace(UNIT_THEN_NUMBER, `$1${PART_BREAK}$2`).split(PART_BREAK)

export const tableRows = (days: ReadonlyArray<TrendDay>, volume: VolumeUnit, locale?: string): TableRow[] =>
  days
    .filter(({ status }) => SHOWN.has(status))
    .map(({ date, status, totals }) => ({
      date,
      name: status === "today" ? `${dayName(date, locale)}, so far` : dayName(date, locale),
      cells:
        status === "no-entries"
          ? ["No entries"]
          : TRENDS_METRICS.map((metric) => metric.format(metric.total(totals), volume)),
    }))
