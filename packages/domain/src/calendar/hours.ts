import type { LocalDate } from "../time/calendar.ts"
import type { Instant, Interval } from "../time/instant.ts"
import { type LocalResolution, localDateTimeOf, resolveLocal } from "../time/wall-clock.ts"
import type { TimeZone } from "../time/zone.ts"
import { type Placing, stepAt } from "./steps.ts"

export interface HourRow extends Interval {
  readonly top: number
  readonly height: number
  readonly repeated: boolean
}

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"))

const instantsOf = (resolution: LocalResolution): ReadonlyArray<Instant> => {
  if (resolution.kind === "ok") return [resolution.instant]
  return resolution.kind === "ambiguous" ? [resolution.earlier, resolution.later] : []
}

const hourStarts = (date: LocalDate, zone: TimeZone, bounds: Interval): ReadonlyArray<Instant> => {
  const starts = HOURS.flatMap((hour) => instantsOf(resolveLocal(`${date}T${hour}:00`, zone)))
  const inside = starts.filter((at) => at > bounds.start && at < bounds.end)
  return [...new Set([bounds.start, ...inside])].toSorted((a, b) => a - b)
}

export const hourRows = (date: LocalDate, zone: TimeZone, placing: Placing): ReadonlyArray<HourRow> => {
  const { bounds, scale } = placing
  const starts = hourStarts(date, zone, bounds)
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? bounds.end
    const top = stepAt(bounds, scale.stepMs, start)
    const previous = starts[index - 1]
    return {
      start,
      end,
      top,
      height: stepAt(bounds, scale.stepMs, end) - top,
      repeated: previous !== undefined && localDateTimeOf(previous, zone) === localDateTimeOf(start, zone),
    }
  })
}
