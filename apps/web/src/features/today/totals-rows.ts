import type { Totals, VolumeUnit } from "@bt/contracts"
import { formatMinutes, formatVolume, presentParts } from "./format.ts"

export interface TotalsRow {
  readonly label: string
  readonly value: string
  readonly detail: ReadonlyArray<string>
}

export const totalsRows = (totals: Totals, volume: VolumeUnit): ReadonlyArray<TotalsRow> => [
  { label: "Feeds started", value: String(totals.feedsStarted), detail: [] },
  {
    label: "Nursing",
    value: formatMinutes(totals.nursingSeconds),
    detail: presentParts([
      [totals.leftSeconds, `Left ${formatMinutes(totals.leftSeconds)}`],
      [totals.rightSeconds, `Right ${formatMinutes(totals.rightSeconds)}`],
    ]),
  },
  {
    label: "Bottles",
    value: formatVolume(totals.bottleMl, volume),
    detail: presentParts([
      [totals.breastMilkMl, `Breast milk ${formatVolume(totals.breastMilkMl, volume)}`],
      [totals.formulaMl, `Formula ${formatVolume(totals.formulaMl, volume)}`],
    ]),
  },
  {
    label: "Diapers",
    value: String(totals.diapers),
    detail: presentParts([
      [totals.wetDiapers, `${totals.wetDiapers} pee`],
      [totals.dirtyDiapers, `${totals.dirtyDiapers} poo`],
    ]),
  },
]
