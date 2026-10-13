import type { HourRow } from "@bt/domain"

const turnOf = (labels: ReadonlyArray<string>, index: number) => {
  const label = labels[index] ?? ""
  if (labels.indexOf(label) < index) return " (second)"
  return labels.lastIndexOf(label) > index ? " (first)" : ""
}

export const hourLabels = (rows: ReadonlyArray<HourRow>, timeZone: string, locale?: string): ReadonlyArray<string> => {
  const format = new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone })
  return rows.map((row) => format.format(row.start))
}

export const hourNames = (rows: ReadonlyArray<HourRow>, labels: ReadonlyArray<string>): ReadonlyArray<string> =>
  rows.map((_, index) => `Log at ${labels[index] ?? ""}${turnOf(labels, index)}`)
