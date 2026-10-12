import type { HourRow } from "@bt/domain"

const turnOf = (row: HourRow, next: HourRow | undefined) => {
  if (row.repeated) return " (second)"
  return next?.repeated === true ? " (first)" : ""
}

export const hourLabels = (rows: ReadonlyArray<HourRow>, timeZone: string, locale?: string): ReadonlyArray<string> => {
  const format = new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone })
  return rows.map((row) => format.format(row.start))
}

export const hourNames = (rows: ReadonlyArray<HourRow>, labels: ReadonlyArray<string>): ReadonlyArray<string> =>
  rows.map((row, index) => `Log at ${labels[index] ?? ""}${turnOf(row, rows[index + 1])}`)
