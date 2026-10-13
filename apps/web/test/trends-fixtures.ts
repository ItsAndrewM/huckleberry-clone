import type { Totals } from "@bt/contracts"
import type { DatedTotals } from "@bt/domain"
import { NO_TOTALS } from "./today-fixtures.ts"

export const TODAY = "2026-10-14"
export const BIRTH = "2026-09-01"
export const LOCALE = "en-US"

export const MONDAY: Totals = {
  ...NO_TOTALS,
  feedsStarted: 8,
  leftSeconds: 3120,
  rightSeconds: 2880,
  nursingSeconds: 6000,
  breastMilkMl: 400,
  formulaMl: 210,
  bottleMl: 610,
  diapers: 8,
  wetDiapers: 6,
  dirtyDiapers: 3,
}

export const TUESDAY: Totals = {
  ...NO_TOTALS,
  feedsStarted: 7,
  leftSeconds: 2400,
  rightSeconds: 2400,
  nursingSeconds: 4800,
  breastMilkMl: 520,
  formulaMl: 0,
  bottleMl: 520,
  diapers: 7,
  wetDiapers: 5,
  dirtyDiapers: 2,
}

export const SO_FAR: Totals = {
  ...NO_TOTALS,
  feedsStarted: 2,
  leftSeconds: 900,
  nursingSeconds: 900,
  diapers: 1,
  wetDiapers: 1,
}

export const dated = (date: string, totals: Totals = NO_TOTALS): DatedTotals => ({ date, totals })

export const WEEK = [
  dated("2026-10-12", MONDAY),
  dated("2026-10-13", TUESDAY),
  dated(TODAY, SO_FAR),
  dated("2026-10-15"),
  dated("2026-10-16"),
  dated("2026-10-17"),
  dated("2026-10-18"),
]
