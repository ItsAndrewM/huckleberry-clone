import type { DayPeriod, Measurement, Totals, Units, VolumeUnit } from "@bt/contracts"
import { clockTime } from "../../clock-time.ts"
import { formatMeasurement } from "../growth/format.ts"
import { GROWTH_METRICS } from "../growth/metrics.ts"
import { formatMinutes, formatVolume, presentParts } from "../today/format.ts"

export interface GrowthItem {
  readonly id: string
  readonly time: string
  readonly values: ReadonlyArray<string>
  readonly name: string
}

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export const totalsLines = (totals: Totals, volume: VolumeUnit): ReadonlyArray<ReadonlyArray<string>> =>
  [
    presentParts([
      [totals.feedsStarted, counted(totals.feedsStarted, "feed started", "feeds started")],
      [totals.nursingSeconds, `${formatMinutes(totals.nursingSeconds)} nursing`],
      [totals.bottleMl, `${formatVolume(totals.bottleMl, volume)} in bottles`],
    ]),
    presentParts([
      [totals.diapers, counted(totals.diapers, "diaper", "diapers")],
      [totals.wetDiapers, `${totals.wetDiapers} pee`],
      [totals.dirtyDiapers, `${totals.dirtyDiapers} poo`],
    ]),
    presentParts([
      [totals.sleepSeconds, `${formatMinutes(totals.sleepSeconds)} asleep`],
      [totals.napSeconds, `${formatMinutes(totals.napSeconds)} naps`],
      [totals.nightSeconds, `${formatMinutes(totals.nightSeconds)} night`],
    ]),
  ].filter((parts) => parts.length > 0)

export const nothingLogged = ({ totals, measurements, doses }: DayPeriod, volume: VolumeUnit): boolean =>
  totalsLines(totals, volume).length === 0 && measurements.length === 0 && doses.length === 0

export const growthItems = (
  measurements: ReadonlyArray<Measurement>,
  units: Units,
  timeZone: string,
  locale?: string,
): ReadonlyArray<GrowthItem> =>
  measurements.map((measurement) => {
    const time = clockTime(measurement.measuredAt, timeZone, locale)
    return {
      id: measurement.id,
      time,
      values: GROWTH_METRICS.flatMap(({ metric, recorded }) => {
        const value = recorded(measurement)
        return value === null ? [] : [formatMeasurement(metric, value, units)]
      }),
      name: `Edit the measurement from ${time}`,
    }
  })
