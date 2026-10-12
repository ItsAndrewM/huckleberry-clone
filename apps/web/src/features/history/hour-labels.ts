import type { HourRow } from "@bt/domain"

export const hourLabels = (rows: ReadonlyArray<HourRow>, timeZone: string, locale?: string): ReadonlyArray<string> => {
  const format = new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone })
  return rows.map((row) => format.format(row.start))
}
