import type { Totals } from "../aggregate/totals.ts"
import type { LocalDate } from "../time/calendar.ts"

export type DayStatus = "before-birth" | "no-entries" | "counted" | "today" | "after-today"

export interface DatedTotals {
  readonly date: LocalDate
  readonly totals: Totals
}

export interface DayAverage {
  readonly totals: Totals
  readonly days: number
}

export const hasEntries = ({ feedsStarted, nursingSeconds, bottleMl, diapers }: Totals): boolean =>
  feedsStarted + nursingSeconds + bottleMl + diapers > 0

export const dayStatus = ({ date, totals }: DatedTotals, today: LocalDate, birthDate: LocalDate): DayStatus => {
  if (date > today) return "after-today"
  if (date === today) return "today"
  if (date < birthDate) return "before-birth"
  return hasEntries(totals) ? "counted" : "no-entries"
}

const meanOf = (all: ReadonlyArray<Totals>): Totals => {
  const mean = (pick: (totals: Totals) => number) => all.reduce((sum, totals) => sum + pick(totals), 0) / all.length
  return {
    feedsStarted: mean((totals) => totals.feedsStarted),
    leftSeconds: mean((totals) => totals.leftSeconds),
    rightSeconds: mean((totals) => totals.rightSeconds),
    nursingSeconds: mean((totals) => totals.nursingSeconds),
    breastMilkMl: mean((totals) => totals.breastMilkMl),
    formulaMl: mean((totals) => totals.formulaMl),
    bottleMl: mean((totals) => totals.bottleMl),
    diapers: mean((totals) => totals.diapers),
    wetDiapers: mean((totals) => totals.wetDiapers),
    dirtyDiapers: mean((totals) => totals.dirtyDiapers),
  }
}

export const averageDay = (
  days: ReadonlyArray<DatedTotals>,
  today: LocalDate,
  birthDate: LocalDate,
): DayAverage | null => {
  const counted = days.filter((day) => dayStatus(day, today, birthDate) === "counted")
  return counted.length === 0 ? null : { totals: meanOf(counted.map(({ totals }) => totals)), days: counted.length }
}
