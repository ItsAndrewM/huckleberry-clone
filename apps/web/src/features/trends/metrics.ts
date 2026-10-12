import type { Totals, VolumeUnit } from "@bt/contracts"
import { flOzFromMl, type RunningPoint, type RunningTotals } from "@bt/domain"
import { formatMinutes, formatVolume, presentParts } from "../today/format.ts"

export type MetricId = "feeds" | "nursing" | "bottles" | "diapers"

export interface MetricPart {
  readonly key: string
  readonly label: string
  readonly amount: (totals: Totals) => number
}

export interface TrendsMetric {
  readonly id: MetricId
  readonly title: string
  readonly parts: ReadonlyArray<MetricPart>
  readonly total: (totals: Totals) => number
  readonly running: (running: RunningTotals) => ReadonlyArray<RunningPoint>
  readonly axis: (volume: VolumeUnit) => string
  readonly axisFloor: (volume: VolumeUnit) => number
  readonly plotted: (amount: number, volume: VolumeUnit) => number
  readonly format: (amount: number, volume: VolumeUnit) => string
  readonly detail: (totals: Totals, volume: VolumeUnit) => ReadonlyArray<string>
}

const count = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

const asIs = (amount: number) => amount

const counted = (amount: number) => count.format(amount)

const FEEDS: TrendsMetric = {
  id: "feeds",
  title: "Feeds started",
  parts: [{ key: "feeds", label: "Feeds started", amount: (totals) => totals.feedsStarted }],
  total: (totals) => totals.feedsStarted,
  running: (running) => running.feedsStarted,
  axis: () => "Feeds",
  axisFloor: () => 4,
  plotted: asIs,
  format: counted,
  detail: () => [],
}

const NURSING: TrendsMetric = {
  id: "nursing",
  title: "Nursing",
  parts: [
    { key: "left", label: "Left", amount: (totals) => totals.leftSeconds },
    { key: "right", label: "Right", amount: (totals) => totals.rightSeconds },
  ],
  total: (totals) => totals.nursingSeconds,
  running: (running) => running.nursingSeconds,
  axis: () => "Minutes",
  axisFloor: () => 60,
  plotted: (seconds) => seconds / 60,
  format: formatMinutes,
  detail: (totals) =>
    presentParts([
      [totals.leftSeconds, `Left ${formatMinutes(totals.leftSeconds)}`],
      [totals.rightSeconds, `Right ${formatMinutes(totals.rightSeconds)}`],
    ]),
}

const BOTTLES: TrendsMetric = {
  id: "bottles",
  title: "Bottles",
  parts: [
    { key: "breast-milk", label: "Breast milk", amount: (totals) => totals.breastMilkMl },
    { key: "formula", label: "Formula", amount: (totals) => totals.formulaMl },
  ],
  total: (totals) => totals.bottleMl,
  running: (running) => running.bottleMl,
  axis: (volume) => (volume === "ml" ? "mL" : "fl oz"),
  axisFloor: (volume) => (volume === "ml" ? 100 : 4),
  plotted: (ml, volume) => (volume === "ml" ? ml : flOzFromMl(ml)),
  format: formatVolume,
  detail: (totals, volume) =>
    presentParts([
      [totals.breastMilkMl, `Breast milk ${formatVolume(totals.breastMilkMl, volume)}`],
      [totals.formulaMl, `Formula ${formatVolume(totals.formulaMl, volume)}`],
    ]),
}

const DIAPERS: TrendsMetric = {
  id: "diapers",
  title: "Diapers",
  parts: [{ key: "diapers", label: "Diapers", amount: (totals) => totals.diapers }],
  total: (totals) => totals.diapers,
  running: (running) => running.diapers,
  axis: () => "Diapers",
  axisFloor: () => 4,
  plotted: asIs,
  format: counted,
  detail: (totals) =>
    presentParts([
      [totals.wetDiapers, `${counted(totals.wetDiapers)} pee`],
      [totals.dirtyDiapers, `${counted(totals.dirtyDiapers)} poo`],
    ]),
}

export const TRENDS_METRICS = [FEEDS, NURSING, BOTTLES, DIAPERS] as const
