import type { Measurement, Me } from "@bt/contracts"
import { datedOf, type GrowthRow, growthRowOf } from "./chart-model.ts"
import { GROWTH_METRICS, type GrowthMetricInfo } from "./metrics.ts"

export interface LatestTile {
  readonly info: GrowthMetricInfo
  readonly latest: GrowthRow | null
  readonly name: string
}

const tileName = (info: GrowthMetricInfo, latest: GrowthRow | null) =>
  latest === null
    ? `${info.label}: none yet`
    : `${info.label}: ${latest.value}, ${latest.percentile}, ${latest.measuredOn}`

export const latestTiles = (
  measurements: ReadonlyArray<Measurement>,
  me: Me,
  locale?: string,
): ReadonlyArray<LatestTile> =>
  GROWTH_METRICS.map((info) => {
    const newest = measurements.find((measurement) => info.recorded(measurement) !== null)
    const latest = newest === undefined ? null : growthRowOf(newest, info, me, locale)
    return { info, latest, name: tileName(info, latest) }
  })

export interface CardCell {
  readonly info: GrowthMetricInfo
  readonly value: string | null
  readonly percentile: string | null
}

export interface MeasurementCard {
  readonly id: string
  readonly measuredOn: string
  readonly age: string
  readonly ageWords: string
  readonly cells: ReadonlyArray<CardCell>
  readonly saving: boolean
}

export const measurementCards = (
  measurements: ReadonlyArray<Measurement>,
  me: Me,
  isSaving: (id: string) => boolean,
  locale?: string,
): ReadonlyArray<MeasurementCard> =>
  measurements.map((measurement) => {
    const { measuredOn, age, ageWords } = datedOf(measurement, me, locale)
    const cells = GROWTH_METRICS.map((info) => {
      const row = growthRowOf(measurement, info, me, locale)
      return { info, value: row?.value ?? null, percentile: row?.percentile ?? null }
    })
    return { id: measurement.id, measuredOn, age, ageWords, cells, saving: isSaving(measurement.id) }
  })
