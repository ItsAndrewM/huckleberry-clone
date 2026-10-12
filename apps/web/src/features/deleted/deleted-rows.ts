import type { Deleted, Diaper, Feed, Me, Measurement } from "@bt/contracts"
import { dateClockTime } from "../../clock-time.ts"
import { formatMeasurement } from "../growth/format.ts"
import { GROWTH_METRICS } from "../growth/metrics.ts"
import { feedParts, feedTitle } from "../today/feed-parts.ts"
import { runningSide } from "../today/feed-status.ts"

export type DeletedRecord =
  | { readonly kind: "feed"; readonly feed: Feed }
  | { readonly kind: "diaper"; readonly diaper: Diaper }
  | { readonly kind: "measurement"; readonly measurement: Measurement }

export type DeletedIcon = "nursing" | "bottle" | "diaper" | "measurement"

export interface DeletedRow {
  readonly id: string
  readonly version: number
  readonly record: DeletedRecord
  readonly icon: DeletedIcon
  readonly title: string
  readonly detail: ReadonlyArray<string>
  readonly at: number
  readonly when: string
  readonly deletedAt: number
  readonly deleted: ReadonlyArray<string>
}

interface Audited {
  readonly id: string
  readonly version: number
  readonly updatedBy: string
  readonly updatedAt: number
  readonly deletedAt: number | null
}

type Described = Pick<DeletedRow, "record" | "icon" | "title" | "detail" | "at">

const deletedLine = (me: Me, { updatedBy }: Audited, deletedAt: number, locale?: string) => {
  const name = me.household.caregivers.find((caregiver) => caregiver.id === updatedBy)?.displayName
  return [
    name === undefined ? "Deleted" : `Deleted by ${name}`,
    dateClockTime(deletedAt, me.household.timeZone, locale),
  ]
}

const rowOf = (me: Me, audited: Audited, described: Described, locale?: string): DeletedRow => {
  const deletedAt = audited.deletedAt ?? audited.updatedAt
  return {
    id: audited.id,
    version: audited.version,
    ...described,
    when: dateClockTime(described.at, me.household.timeZone, locale),
    deletedAt,
    deleted: deletedLine(me, audited, deletedAt, locale),
  }
}

const stateWhenDeleted = (feed: Feed) => {
  if (feed.status !== "active") return []
  return [runningSide(feed) === undefined ? "Paused when deleted" : "Running when deleted"]
}

const feedDescribed = (feed: Feed, me: Me): Described => ({
  record: { kind: "feed", feed },
  icon: feed.segments.length === 0 ? "bottle" : "nursing",
  title: feedTitle(feed),
  detail: [...stateWhenDeleted(feed), ...feedParts(feed, me.household.units.volume, feed.deletedAt ?? feed.updatedAt)],
  at: feed.startedAt,
})

const diaperDetail = ({ wet, dirty }: Diaper) => {
  if (wet && dirty) return "Pee and poo"
  return wet ? "Pee" : "Poo"
}

const diaperDescribed = (diaper: Diaper): Described => ({
  record: { kind: "diaper", diaper },
  icon: "diaper",
  title: "Diaper",
  detail: [diaperDetail(diaper)],
  at: diaper.occurredAt,
})

const measurementDescribed = (measurement: Measurement, me: Me): Described => ({
  record: { kind: "measurement", measurement },
  icon: "measurement",
  title: "Measurement",
  detail: GROWTH_METRICS.flatMap((info) => {
    const value = info.recorded(measurement)
    return value === null ? [] : [`${info.label} ${formatMeasurement(info.metric, value, me.household.units)}`]
  }),
  at: measurement.measuredAt,
})

export const deletedRows = (deleted: Deleted, me: Me, locale?: string): ReadonlyArray<DeletedRow> =>
  [
    ...deleted.feeds.map((feed) => rowOf(me, feed, feedDescribed(feed, me), locale)),
    ...deleted.diapers.map((diaper) => rowOf(me, diaper, diaperDescribed(diaper), locale)),
    ...deleted.measurements.map((measurement) => rowOf(me, measurement, measurementDescribed(measurement, me), locale)),
  ].toSorted((a, b) => b.deletedAt - a.deletedAt)
