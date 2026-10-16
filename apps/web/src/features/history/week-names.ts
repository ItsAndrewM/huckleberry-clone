import type { LocalDate, Totals, VolumeUnit } from "@bt/contracts"
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

const NO_SLEEP = { sleepsStarted: 0, sleepSeconds: 0, napSeconds: 0, nightSeconds: 0, longestSleepSeconds: 0 }

export const shownTotals = (totals: Totals, hidden: Hidden): Totals => {
  const fed = hidden.has("feeds") ? { ...totals, ...NO_FEEDS } : totals
  const changed = hidden.has("diapers") ? { ...fed, ...NO_DIAPERS } : fed
  return hidden.has("sleep") ? { ...changed, ...NO_SLEEP } : changed
}

const dosesSaid = (count: number) => {
  if (count === 0) return []
  return [count === 1 ? "a dose" : `${count} doses`]
}

export const columnName = (
  column: WeekColumn,
  volume: VolumeUnit,
  hidden: Hidden,
  today: LocalDate,
  locale?: string,
) => {
  const lines = totalsLines(shownTotals(column.totals, hidden), volume).map((parts) => parts.join(", "))
  const said = [...lines, ...(column.measured ? ["a measurement"] : []), ...dosesSaid(column.dosesShown)]
  const nothing = column.logged ? "nothing shown" : "nothing logged"
  const day = column.date === today ? `${dayTitle(column.date, locale)}, today` : dayTitle(column.date, locale)
  return `${day}: ${said.length === 0 ? nothing : said.join("; ")}`
}
