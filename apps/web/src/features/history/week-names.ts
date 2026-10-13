import type { Totals, VolumeUnit } from "@bt/contracts"
import { totalsLines } from "./day-summary.ts"
import { dayTitle } from "./history-date.ts"
import type { Hidden } from "./history-kinds.ts"
import type { WeekColumn } from "./week-model.ts"

const NO_FEEDS = {
  feedsStarted: 0,
  leftSeconds: 0,
  rightSeconds: 0,
  nursingSeconds: 0,
  breastMilkMl: 0,
  formulaMl: 0,
  bottleMl: 0,
}

const NO_DIAPERS = { diapers: 0, wetDiapers: 0, dirtyDiapers: 0 }

export const shownTotals = (totals: Totals, hidden: Hidden): Totals => {
  const fed = hidden.has("feeds") ? { ...totals, ...NO_FEEDS } : totals
  return hidden.has("diapers") ? { ...fed, ...NO_DIAPERS } : fed
}

export const columnName = (column: WeekColumn, volume: VolumeUnit, hidden: Hidden, locale?: string) => {
  const lines = totalsLines(shownTotals(column.totals, hidden), volume).map((parts) => parts.join(", "))
  const said = column.measured ? [...lines, "a measurement"] : lines
  const nothing = column.logged ? "nothing shown" : "nothing logged"
  return `${dayTitle(column.date, locale)}: ${said.length === 0 ? nothing : said.join("; ")}`
}
